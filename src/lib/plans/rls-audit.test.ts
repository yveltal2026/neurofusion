import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "aesteros.com" }),
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: () => true,
  publicEnv: () => ({ appUrl: "https://aesteros.com" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signUp: mocks.signUp },
  }),
}));

import { signUp } from "@/lib/auth/actions";

describe("Seguridad de registro público y migración RLS/RPC", () => {
  it("rechaza registro sin segmento de audiencia y no reenvía plan_tier o créditos del cliente", async () => {
    const missing = new FormData();
    missing.set("email", "test@aesteros.com");
    missing.set("password", "Password123!");
    const errRes = await signUp({}, missing);
    expect(errRes.error).toBe("Selecciona qué perfil te describe mejor.");
    expect(mocks.signUp).not.toHaveBeenCalled();

    const tampered = new FormData();
    tampered.set("email", "docente@uni.edu");
    tampered.set("password", "Password123!");
    tampered.set("audience_segment", "teacher");
    tampered.set("plan_tier", "enterprise");
    tampered.set("credits", "99999");

    const okRes = await signUp({}, tampered);
    expect(okRes.error).toBeUndefined();
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { audience_segment: "teacher" },
        }),
      }),
    );
  });

  it("la migración SQL habilita RLS y revoca RPCs sensibles de public/anon/authenticated", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261120000000_demo_onboarding_credits.sql",
      ),
      "utf8",
    );

    for (const table of [
      "credit_ledger",
      "onboarding_progress",
      "membership_requests",
      "activation_codes",
      "activation_redemptions",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }

    expect(sql).toContain(
      "revoke all on function public.consume_org_credits(uuid, uuid, integer, text, text, text, text)\n  from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "revoke all on function public.grant_org_credits(uuid, uuid, integer, text, text, text, text)\n  from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "revoke all on function public.redeem_activation_code(uuid, uuid, text)\n  from public, anon, authenticated;",
    );
    expect(sql).toContain("values (coalesce(safe_org_name, display, 'Mi organización'), 'demo')");
    expect(sql).toContain("values (new_org, new.id, 30, 'initial_demo_grant'");
    expect(sql).toContain("when coalesce(org_plan, 'demo') = 'demo' then least(coalesce(s.max_responses, 15), 15)");
  });
});
