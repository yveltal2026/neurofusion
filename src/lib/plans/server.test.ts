import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import {
  assertCanCreateProject,
  assertCanCreateStudy,
  refundReservedCredits,
  reserveCreditsForAction,
} from "./server";

function mockClient({
  planTier = "demo",
  projects = [{ id: "p-1" }],
  studiesCount = 0,
}: {
  planTier?: string;
  projects?: { id: string }[];
  studiesCount?: number;
}) {
  return {
    from: (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (table === "organizations") {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: { plan_tier: planTier }, error: null }),
            }),
          };
        }
        if (table === "projects") {
          return {
            eq: async () =>
              opts?.head
                ? { count: projects.length, error: null }
                : { data: projects, error: null },
          };
        }
        return {
          in: async () => ({ count: studiesCount, error: null }),
        };
      },
    }),
  } as unknown as SupabaseClient;
}

describe("plans/server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloquea el segundo proyecto en DEMO y permite en PRO", async () => {
    const blocked = await assertCanCreateProject(
      mockClient({ planTier: "demo", projects: [{ id: "p-1" }] }),
      "org-1",
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("DEMO");

    const allowed = await assertCanCreateProject(
      mockClient({ planTier: "pro", projects: [{ id: "p-1" }] }),
      "org-1",
    );
    expect(allowed.ok).toBe(true);
  });

  it("bloquea el cuarto estudio en DEMO", async () => {
    const allowed = await assertCanCreateStudy(
      mockClient({ planTier: "demo", projects: [{ id: "p-1" }], studiesCount: 2 }),
      "org-1",
    );
    expect(allowed.ok).toBe(true);

    const blocked = await assertCanCreateStudy(
      mockClient({ planTier: "demo", projects: [{ id: "p-1" }], studiesCount: 3 }),
      "org-1",
    );
    expect(blocked.ok).toBe(false);
  });

  it("reserva créditos atómicamente y reintegra con clave idempotente si falla", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ok: true, balance: 25, ledger_id: "led-1" }],
      error: null,
    });

    const res = await reserveCreditsForAction({
      orgId: "org-1",
      userId: "user-1",
      action: "ai_analysis",
      referenceId: "study-1",
    });
    expect(res).toEqual({ ok: true, ledgerId: "led-1", balance: 25, cost: 5 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "consume_org_credits",
      expect.objectContaining({ p_amount: 5, p_event_type: "ai_analysis" }),
    );

    mocks.rpc.mockResolvedValueOnce({ data: [{ granted: true, balance: 30 }], error: null });
    await refundReservedCredits({
      orgId: "org-1",
      userId: "user-1",
      ledgerId: "led-1",
      action: "ai_analysis",
      referenceId: "study-1",
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "grant_org_credits",
      expect.objectContaining({
        p_amount: 5,
        p_event_type: "refund",
        p_idempotency_key: "refund:led-1",
      }),
    );
  });

  it("bloquea cuando el saldo es insuficiente", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ok: false, balance: 2, ledger_id: null }],
      error: null,
    });

    const res = await reserveCreditsForAction({
      orgId: "org-1",
      userId: "user-1",
      action: "seo_audit",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.balance).toBe(2);
      expect(res.cost).toBe(10);
      expect(res.error).toContain("10 créditos");
    }
  });
});
