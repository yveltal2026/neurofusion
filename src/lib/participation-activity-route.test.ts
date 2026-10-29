import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleParticipationActivity } from "./participation-activity-route";
import { signDeviceId, deviceCookieName } from "./participant-lock";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  parent: "10000000-0000-4000-8000-000000000001" as string | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ PARTICIPANT_LOCK_SECRET: "test-participation-secret" }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));
const parentId = "10000000-0000-4000-8000-000000000001";
const device = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const token = "t".repeat(43);
function request(cookie = true, body: unknown = { sessionId, away: false }) {
  return new NextRequest(`https://test.example/api/s/${token}/activity`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: cookie
      ? {
          cookie: `${deviceCookieName(parentId)}=${signDeviceId(device, "test-participation-secret")}`,
        }
      : {},
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parent = parentId;
  mocks.rpc.mockResolvedValue({ data: "ok", error: null });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: mocks.parent ? { id: mocks.parent } : null,
      error: null,
    }),
  };
  mocks.admin.mockReturnValue({ from: () => query, rpc: mocks.rpc });
});
describe("participation activity API", () => {
  it.each(["study", "battery"] as const)(
    "binds %s activity to link, session and signed device",
    async (kind) => {
      expect(
        (await handleParticipationActivity(request(), token, kind)).status,
      ).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith("touch_participation_activity", {
        p_kind: kind,
        p_parent: parentId,
        p_session: sessionId,
        p_device: device,
        p_away: false,
      });
    },
  );
  it("rejects missing device cookies and bad session IDs before writing", async () => {
    expect(
      (await handleParticipationActivity(request(false), token, "study"))
        .status,
    ).toBe(404);
    expect(
      (
        await handleParticipationActivity(
          request(true, { sessionId: "invalid", away: false }),
          token,
          "study",
        )
      ).status,
    ).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not touch sessions through an invalid link", async () => {
    mocks.parent = null;
    expect(
      (await handleParticipationActivity(request(), token, "study")).status,
    ).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["not_found", "expired", "completed"])(
    "handles server outcome %s",
    async (outcome) => {
      mocks.rpc.mockResolvedValue({ data: outcome, error: null });
      const response = await handleParticipationActivity(
        request(),
        token,
        "study",
      );
      expect(response.status).toBe(
        outcome === "expired" ? 409 : outcome === "not_found" ? 404 : 200,
      );
      if (outcome === "expired")
        expect(await response.json()).toEqual({ ok: false, expired: true });
    },
  );
});
