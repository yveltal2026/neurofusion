import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import {
  DEFAULT_THANK_YOU as SURVEY_THANK_YOU,
  defaultConsentText as surveyConsent,
  type SurveyConfig,
} from "@/tools/survey/engine";
import {
  DEFAULT_BATTERY_THANK_YOU,
  defaultBatteryConsentText,
  type BatteryConfig,
} from "./engine";
import {
  batteryConsentVersion,
  completeBatterySession,
  loadBatteryProgress,
  startBatterySession,
} from "./participant";

const config: BatteryConfig = {
  version: 1,
  title: "Estudio",
  texts: {
    consent: defaultBatteryConsentText("Estudio"),
    thankYou: DEFAULT_BATTERY_THANK_YOU,
  },
};
const battery = { id: "bat-1", config };

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });

/** Cliente falso: cada tabla devuelve un resultado fijo; `rpc` devuelve el que se le indique por nombre. */
function fakeAdmin(
  opts: { tables?: Record<string, Result>; rpc?: Record<string, Result> } = {},
) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const builder = (result: Result) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.maybeSingle = async () => result;
    b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return b;
  };
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return opts.rpc?.[name] ?? ok(null);
    },
    from: (table: string) => builder(opts.tables?.[table] ?? ok(null)),
  };
  return { admin: admin as unknown as SupabaseClient, rpcCalls };
}

const iatCfg = demoConfig();
const surveyCfg: SurveyConfig = {
  version: 1,
  title: "Encuesta",
  texts: { consent: surveyConsent("Encuesta"), thankYou: SURVEY_THANK_YOU },
  blocks: [
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};

const device = {
  deviceId: "dev-1",
  ipHash: "h",
  userAgent: "ua",
  deviceType: "mobile",
};

describe("consentimiento", () => {
  it("la versión cambia sola cuando cambia el texto y es estable si no", () => {
    const a = batteryConsentVersion(config);
    expect(a).toMatch(/^bv-[0-9a-f]{12}$/);
    expect(batteryConsentVersion(config)).toBe(a);
    expect(
      batteryConsentVersion({
        ...config,
        texts: { ...config.texts, consent: config.texts.consent + "." },
      }),
    ).not.toBe(a);
  });
});

describe("inicio de la sesión de batería", () => {
  it("abre la sesión con los parámetros del candado", async () => {
    const f = fakeAdmin({
      rpc: {
        claim_battery_session: ok([{ outcome: "ok", new_session_id: "bs-1" }]),
      },
    });
    expect(await startBatterySession(f.admin, battery, device)).toEqual({
      ok: true,
      sessionId: "bs-1",
      resumed: false,
    });
    expect(f.rpcCalls[0]).toEqual({
      name: "claim_battery_session",
      args: {
        p_battery: "bat-1",
        p_device_id: "dev-1",
        p_ip_hash: "h",
        p_user_agent: "ua",
        p_consent_version: batteryConsentVersion(config),
        p_device_type: "mobile",
      },
    });
  });

  it("reanudar devuelve la misma sesión marcada como reanudada", async () => {
    const f = fakeAdmin({
      rpc: {
        claim_battery_session: ok([
          { outcome: "resumed", new_session_id: "bs-9" },
        ]),
      },
    });
    expect(await startBatterySession(f.admin, battery, device)).toEqual({
      ok: true,
      sessionId: "bs-9",
      resumed: true,
    });
  });

  it.each([
    ["already_participated", "already_participated"],
    ["full", "full"],
    ["closed", "closed"],
    ["not_published", "not_available"],
    ["not_found", "not_available"],
    ["no_steps", "not_available"],
    ["algo_raro", "server_error"],
  ])("resultado %s → %s", async (outcome, code) => {
    const f = fakeAdmin({
      rpc: { claim_battery_session: ok([{ outcome, new_session_id: null }]) },
    });
    expect(await startBatterySession(f.admin, battery, device)).toEqual({
      ok: false,
      code,
    });
  });

  it("error de la base, respuesta vacía o sesión sin id → error de servidor", async () => {
    expect(
      await startBatterySession(
        fakeAdmin({
          rpc: {
            claim_battery_session: { data: null, error: { message: "x" } },
          },
        }).admin,
        battery,
        device,
      ),
    ).toEqual({ ok: false, code: "server_error" });
    expect(
      await startBatterySession(
        fakeAdmin({ rpc: { claim_battery_session: ok([]) } }).admin,
        battery,
        device,
      ),
    ).toEqual({ ok: false, code: "server_error" });
    expect(
      await startBatterySession(
        fakeAdmin({
          rpc: {
            claim_battery_session: ok([
              { outcome: "ok", new_session_id: null },
            ]),
          },
        }).admin,
        battery,
        device,
      ),
    ).toEqual({ ok: false, code: "server_error" });
  });
});

describe("progreso", () => {
  const session = {
    id: "bs-1",
    battery_id: "bat-1",
    status: "started",
    run_order: ["s-iat", "s-sv"],
  };
  const studies = [
    {
      id: "s-sv",
      tool_type: "survey",
      access_token: "tok-sv",
      config: surveyCfg,
    },
    {
      id: "s-iat",
      tool_type: "iat",
      access_token: "tok-iat",
      config: iatCfg,
    },
  ];

  it("devuelve los pasos en el orden fijado al iniciar (no el de la consulta) con sus ligas", async () => {
    const f = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok(studies),
        sessions: ok([{ study_id: "s-iat", status: "completed" }]),
      },
    });
    const res = await loadBatteryProgress(f.admin, "bat-1", "bs-1");
    expect(res.ok && res.value.steps).toEqual([
      { studyId: "s-iat", tool: "iat", token: "tok-iat", config: iatCfg },
      { studyId: "s-sv", tool: "survey", token: "tok-sv", config: surveyCfg },
    ]);
    expect(res.ok && res.value.progress).toEqual([
      { studyId: "s-iat", status: "completed" },
      { studyId: "s-sv", status: "pending" },
    ]);
    expect(res.ok && res.value.complete).toBe(false);
  });

  it("completa cuando todos los pasos están completados, o cuando la sesión ya está cerrada", async () => {
    const all = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok(studies),
        sessions: ok([
          { study_id: "s-iat", status: "completed" },
          { study_id: "s-sv", status: "completed" },
        ]),
      },
    });
    expect(
      (
        (await loadBatteryProgress(all.admin, "bat-1", "bs-1")) as {
          value: { complete: boolean };
        }
      ).value.complete,
    ).toBe(true);

    const closed = fakeAdmin({
      tables: {
        battery_sessions: ok({ ...session, status: "completed" }),
        studies: ok(studies),
        sessions: ok([]),
      },
    });
    expect(
      (
        (await loadBatteryProgress(closed.admin, "bat-1", "bs-1")) as {
          value: { complete: boolean };
        }
      ).value.complete,
    ).toBe(true);
  });

  it("una sesión que no pertenece a esta batería (otro token) o no existe → no encontrada", async () => {
    const other = fakeAdmin({
      tables: { battery_sessions: ok({ ...session, battery_id: "bat-OTRA" }) },
    });
    expect(await loadBatteryProgress(other.admin, "bat-1", "bs-1")).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(
      await loadBatteryProgress(
        fakeAdmin({ tables: { battery_sessions: ok(null) } }).admin,
        "bat-1",
        "bs-1",
      ),
    ).toEqual({ ok: false, code: "not_found" });
  });

  it("datos inconsistentes o errores de la base → error de servidor", async () => {
    expect(
      await loadBatteryProgress(
        fakeAdmin({
          tables: {
            battery_sessions: ok({ ...session, run_order: "no es lista" }),
          },
        }).admin,
        "bat-1",
        "bs-1",
      ),
    ).toEqual({ ok: false, code: "server_error" });
    expect(
      await loadBatteryProgress(
        fakeAdmin({
          tables: { battery_sessions: { data: null, error: { message: "x" } } },
        }).admin,
        "bat-1",
        "bs-1",
      ),
    ).toEqual({ ok: false, code: "server_error" });
    // Un paso cuyo estudio ya no existe (o no es IAT/encuesta) no se puede correr.
    const missing = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok([studies[1]]),
        sessions: ok([]),
      },
    });
    expect(await loadBatteryProgress(missing.admin, "bat-1", "bs-1")).toEqual({
      ok: false,
      code: "server_error",
    });
    const wrongTool = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok([
          studies[1],
          { id: "s-iat", tool_type: "seo", access_token: "t" },
        ]),
        sessions: ok([]),
      },
    });
    expect(await loadBatteryProgress(wrongTool.admin, "bat-1", "bs-1")).toEqual(
      { ok: false, code: "server_error" },
    );
    const badConfig = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok([{ ...studies[0], config: { version: 1 } }, studies[1]]),
        sessions: ok([]),
      },
    });
    expect(await loadBatteryProgress(badConfig.admin, "bat-1", "bs-1")).toEqual(
      { ok: false, code: "server_error" },
    );
    const failChildren = fakeAdmin({
      tables: {
        battery_sessions: ok(session),
        studies: ok(studies),
        sessions: { data: null, error: { message: "x" } },
      },
    });
    expect(
      await loadBatteryProgress(failChildren.admin, "bat-1", "bs-1"),
    ).toEqual({ ok: false, code: "server_error" });
  });
});

describe("cierre de la sesión de batería", () => {
  const tables = { battery_sessions: ok({ id: "bs-1", battery_id: "bat-1" }) };

  it.each([
    ["ok", { ok: true }],
    ["incomplete", { ok: false, code: "incomplete" }],
    ["not_found", { ok: false, code: "not_found" }],
    ["algo_raro", { ok: false, code: "server_error" }],
  ])("la base responde %s", async (outcome, expected) => {
    const f = fakeAdmin({
      tables,
      rpc: { complete_battery_session: ok(outcome) },
    });
    expect(await completeBatterySession(f.admin, "bat-1", "bs-1")).toEqual(
      expected,
    );
    expect(f.rpcCalls[0]).toEqual({
      name: "complete_battery_session",
      args: { p_battery_session: "bs-1" },
    });
  });

  it("no cierra sesiones de otra batería y no llama a la base si no corresponde", async () => {
    const f = fakeAdmin({
      tables: { battery_sessions: ok({ id: "bs-1", battery_id: "bat-OTRA" }) },
    });
    expect(await completeBatterySession(f.admin, "bat-1", "bs-1")).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("errores de la base → error de servidor", async () => {
    expect(
      await completeBatterySession(
        fakeAdmin({
          tables,
          rpc: {
            complete_battery_session: { data: null, error: { message: "x" } },
          },
        }).admin,
        "bat-1",
        "bs-1",
      ),
    ).toEqual({ ok: false, code: "server_error" });
    expect(
      await completeBatterySession(
        fakeAdmin({
          tables: { battery_sessions: { data: null, error: { message: "x" } } },
        }).admin,
        "bat-1",
        "bs-1",
      ),
    ).toEqual({ ok: false, code: "server_error" });
  });
});
