import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { validVariantConfig } from "./defaults";
import { startVariantSession } from "./participant";

const study = { id: "study-1", config: validVariantConfig("sc_iat") };
const device = {
  inputMode: "keyboard",
  deviceType: "desktop",
  screenWidth: 1280,
  screenHeight: 800,
} as const;

function fakeAdmin(link: string | Error) {
  const rpcCalls: string[] = [];
  const abandoned: string[] = [];
  const admin = {
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === "claim_session")
        return { data: [{ outcome: "ok", new_session_id: "sess-1" }], error: null };
      return typeof link === "string" ? { data: link, error: null } : { data: null, error: link };
    },
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: async () => {
            abandoned.push("sess-1");
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin: admin as unknown as SupabaseClient, rpcCalls, abandoned };
}

const input = { deviceId: "d", ipHash: null, userAgent: null, device };

describe("variante del IAT como paso de una batería", () => {
  it("sin sesión de batería funciona como siempre", async () => {
    const f = fakeAdmin("ok");
    expect(await startVariantSession(f.admin, study, input)).toEqual({ ok: true, sessionId: "sess-1" });
    expect(f.rpcCalls).toEqual(["claim_session"]);
  });

  it("con sesión de batería enlaza el paso después de crear la sesión", async () => {
    const f = fakeAdmin("ok");
    expect(await startVariantSession(f.admin, study, { ...input, batterySessionId: "bat-1" })).toEqual({
      ok: true,
      sessionId: "sess-1",
    });
    expect(f.rpcCalls).toEqual(["claim_session", "link_battery_step"]);
    expect(f.abandoned).toEqual([]);
  });

  it.each([
    ["out_of_order", "out_of_order"],
    ["study_not_in_battery", "invalid_data"],
    ["battery_session_closed", "closed"],
  ])("si la base rechaza el enlace (%s), devuelve %s y abandona la sesión creada", async (outcome, code) => {
    const f = fakeAdmin(outcome);
    expect(await startVariantSession(f.admin, study, { ...input, batterySessionId: "bat-1" })).toEqual({ ok: false, code });
    expect(f.abandoned).toEqual(["sess-1"]);
  });
});
