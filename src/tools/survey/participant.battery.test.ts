import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THANK_YOU,
  defaultConsentText,
  type SurveyConfig,
} from "./engine";
import { startSurveySession } from "./participant";

const config: SurveyConfig = {
  version: 1,
  title: "Encuesta",
  texts: {
    consent: defaultConsentText("Encuesta"),
    thankYou: DEFAULT_THANK_YOU,
  },
  blocks: [
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};
const study = { id: "study-1", config };
const device = {
  inputMode: "touch",
  deviceType: "mobile",
  screenWidth: 390,
  screenHeight: 844,
} as const;

function fakeAdmin(link: string | Error) {
  const rpcCalls: string[] = [];
  const abandoned: string[] = [];
  const admin = {
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === "claim_session")
        return {
          data: [{ outcome: "ok", new_session_id: "sess-1" }],
          error: null,
        };
      return typeof link === "string"
        ? { data: link, error: null }
        : { data: null, error: link };
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

describe("encuesta como paso de una batería", () => {
  it("sin sesión de batería no intenta enlazar (comportamiento de siempre)", async () => {
    const f = fakeAdmin("ok");
    expect(
      await startSurveySession(f.admin, study, {
        deviceId: "d",
        ipHash: null,
        userAgent: null,
        device,
      }),
    ).toEqual({ ok: true, sessionId: "sess-1" });
    expect(f.rpcCalls).toEqual(["claim_session"]);
  });

  it("con sesión de batería enlaza el paso después de crear la sesión", async () => {
    const f = fakeAdmin("ok");
    const res = await startSurveySession(f.admin, study, {
      deviceId: "d",
      ipHash: null,
      userAgent: null,
      device,
      batterySessionId: "bat-1",
    });
    expect(res).toEqual({ ok: true, sessionId: "sess-1" });
    expect(f.rpcCalls).toEqual(["claim_session", "link_battery_step"]);
    expect(f.abandoned).toEqual([]);
  });

  it("si el orden no se respeta, rechaza y abandona la sesión creada", async () => {
    const f = fakeAdmin("out_of_order");
    const res = await startSurveySession(f.admin, study, {
      deviceId: "d",
      ipHash: null,
      userAgent: null,
      device,
      batterySessionId: "bat-1",
    });
    expect(res).toEqual({ ok: false, code: "out_of_order" });
    expect(f.abandoned).toEqual(["sess-1"]);
  });

  it("si el paso no pertenece a la batería, rechaza como datos inválidos", async () => {
    const f = fakeAdmin("study_not_in_battery");
    const res = await startSurveySession(f.admin, study, {
      deviceId: "d",
      ipHash: null,
      userAgent: null,
      device,
      batterySessionId: "bat-1",
    });
    expect(res).toEqual({ ok: false, code: "invalid_data" });
    expect(f.abandoned).toEqual(["sess-1"]);
  });
});
