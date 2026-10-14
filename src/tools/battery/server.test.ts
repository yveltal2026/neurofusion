import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { defaultConsentText, DEFAULT_THANK_YOU } from "@/tools/survey/engine";
import { defaultBatteryConsent, DEFAULT_BATTERY_THANK_YOU } from "./engine/config";
import {
  attachChildSession,
  authorizeChildLink,
  batteryConsentVersion,
  batteryProgress,
  completeBattery,
  loadBatteryByToken,
  startBatterySession,
  type ParticipantBattery,
} from "./server";

type Row = Record<string, unknown>;

/** Cliente de Supabase falso en memoria: tablas, filtros eq/in, order, update y rpc. */
function fakeAdmin(tables: Record<string, Row[]>, opts: { rpc?: (name: string, args: Row) => { data: unknown; error: unknown }; failTable?: string } = {}) {
  const calls: { op: string; table: string; payload?: Row }[] = [];
  const client = {
    rpc: async (name: string, args: Row) => opts.rpc?.(name, args) ?? { data: null, error: null },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let order: { col: string; asc: boolean } | null = null;
      let patch: Row | null = null;
      const rows = () => {
        let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) out = [...out].sort((a, b) => ((a[order!.col] as number) - (b[order!.col] as number)) * (order!.asc ? 1 : -1));
        return out;
      };
      const run = () => {
        if (opts.failTable === table) return { data: null, error: { message: "fallo" } };
        if (patch) {
          const hit = rows();
          for (const r of hit) Object.assign(r, patch);
          calls.push({ op: "update", table, payload: patch });
          return { data: hit.map((r) => ({ ...r })), error: null };
        }
        return { data: rows().map((r) => ({ ...r })), error: null };
      };
      const api: Record<string, unknown> = {
        select: () => api,
        update: (p: Row) => {
          patch = p;
          return api;
        },
        eq: (col: string, v: unknown) => {
          filters.push((r) => r[col] === v);
          return api;
        },
        in: (col: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[col]));
          return api;
        },
        order: (col: string, o: { ascending: boolean }) => {
          order = { col, asc: o.ascending };
          return api;
        },
        maybeSingle: async () => {
          const res = run();
          return { data: res.data?.[0] ?? null, error: res.error };
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return api;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, tables };
}

const iatConfig = demoConfig();
const surveyConfig = {
  version: 1,
  title: "Encuesta",
  texts: { consent: defaultConsentText("Encuesta"), thankYou: DEFAULT_THANK_YOU },
  blocks: [{ kind: "instrument", id: "nps", instrumentId: "nps", required: true }],
};

function baseTables(): Record<string, Row[]> {
  return {
    batteries: [
      {
        id: "bat-1",
        name: "Batería",
        status: "published",
        closes_at: null,
        duplicate_policy: "device_cookie",
        access_token: "tok-bat",
        config: { version: 1, texts: { consent: defaultBatteryConsent("Batería"), thankYou: DEFAULT_BATTERY_THANK_YOU } },
      },
    ],
    battery_steps: [
      { battery_id: "bat-1", position: 1, enabled: true, study_id: "s-survey" },
      { battery_id: "bat-1", position: 0, enabled: true, study_id: "s-iat" },
      { battery_id: "bat-1", position: 2, enabled: false, study_id: "s-off" },
    ],
    studies: [
      { id: "s-iat", tool_type: "iat", name: "IAT", status: "published", access_token: "tok-iat", config: iatConfig },
      { id: "s-survey", tool_type: "survey", name: "Encuesta", status: "published", access_token: "tok-sv", config: surveyConfig },
      { id: "s-off", tool_type: "survey", name: "Omitida", status: "draft", access_token: "tok-off", config: surveyConfig },
    ],
    battery_sessions: [{ id: "bs-1", battery_id: "bat-1", status: "started" }],
    sessions: [],
  };
}

async function loaded(tables = baseTables()): Promise<{ battery: ParticipantBattery; admin: ReturnType<typeof fakeAdmin> }> {
  const admin = fakeAdmin(tables);
  const res = await loadBatteryByToken(admin.client, "tok-bat");
  if (!res.ok) throw new Error(`no cargó: ${res.code}`);
  return { battery: res.battery, admin };
}

describe("loadBatteryByToken", () => {
  it("carga sólo los pasos activos, en el orden guardado, con su configuración validada", async () => {
    const { battery } = await loaded();
    expect(battery.steps.map((s) => s.studyId)).toEqual(["s-iat", "s-survey"]);
    expect(battery.steps.map((s) => s.tool)).toEqual(["iat", "survey"]);
    expect(battery.steps[0]!.token).toBe("tok-iat");
  });

  it("un token desconocido es una liga inválida", async () => {
    const admin = fakeAdmin(baseTables());
    expect(await loadBatteryByToken(admin.client, "otro")).toEqual({ ok: false, code: "invalid_link" });
  });

  it("falla si la configuración de un paso es inválida", async () => {
    const t = baseTables();
    (t.studies![0] as Row).config = { roto: true };
    const admin = fakeAdmin(t);
    expect(await loadBatteryByToken(admin.client, "tok-bat")).toEqual({ ok: false, code: "server_error" });
  });

  it("falla si la configuración de la batería es inválida o la base falla", async () => {
    const t = baseTables();
    (t.batteries![0] as Row).config = {};
    expect((await loadBatteryByToken(fakeAdmin(t).client, "tok-bat")).ok).toBe(false);
    const broken = fakeAdmin(baseTables(), { failTable: "battery_steps" });
    expect(await loadBatteryByToken(broken.client, "tok-bat")).toEqual({ ok: false, code: "server_error" });
  });
});

describe("startBatterySession", () => {
  const input = { deviceId: "dev", ipHash: "h", userAgent: "ua", deviceType: "desktop" as const, consentVersion: "bt-1" };

  it("abre la sesión y manda el orden corrido a la función atómica", async () => {
    const { battery } = await loaded();
    let args: Row | null = null;
    const admin = fakeAdmin({}, { rpc: (_n, a) => ((args = a), { data: [{ outcome: "ok", new_session_id: "bs-9" }], error: null }) });
    expect(await startBatterySession(admin.client, battery, input)).toEqual({ ok: true, batterySessionId: "bs-9" });
    expect(args).toMatchObject({ p_battery: "bat-1", p_device_id: "dev", p_run_order: ["s-iat", "s-survey"], p_consent_version: "bt-1" });
  });

  it("traduce los resultados del candado y los límites", async () => {
    const { battery } = await loaded();
    const cases: [string, string][] = [
      ["already_participated", "already_participated"],
      ["full", "full"],
      ["closed", "closed"],
      ["not_published", "not_available"],
      ["not_found", "not_available"],
      ["raro", "server_error"],
    ];
    for (const [outcome, code] of cases) {
      const admin = fakeAdmin({}, { rpc: () => ({ data: [{ outcome, new_session_id: null }], error: null }) });
      expect(await startBatterySession(admin.client, battery, input)).toEqual({ ok: false, code });
    }
    const failing = fakeAdmin({}, { rpc: () => ({ data: null, error: { message: "x" } }) });
    expect(await startBatterySession(failing.client, battery, input)).toEqual({ ok: false, code: "server_error" });
  });

  it("no abre una batería con un paso sin publicar ni sin pasos", async () => {
    const { battery } = await loaded();
    const admin = fakeAdmin({}, { rpc: () => ({ data: [{ outcome: "ok", new_session_id: "x" }], error: null }) });
    const draft = { ...battery, steps: battery.steps.map((s, i) => (i === 1 ? { ...s, status: "draft" as const } : s)) };
    expect(await startBatterySession(admin.client, draft, input)).toEqual({ ok: false, code: "not_available" });
    expect(await startBatterySession(admin.client, { ...battery, steps: [] }, input)).toEqual({ ok: false, code: "not_available" });
  });
});

describe("batteryProgress", () => {
  it("deriva el estado de los pasos de las sesiones hijas y señala el siguiente", async () => {
    const t = baseTables();
    t.sessions = [
      { id: "c1", study_id: "s-iat", battery_session_id: "bs-1", status: "completed" },
      { id: "c2", study_id: "s-survey", battery_session_id: "bs-1", status: "started" },
    ];
    const { battery, admin } = await loaded(t);
    const r = await batteryProgress(admin.client, battery, "bs-1");
    expect(r.ok && r.progress.steps).toEqual([
      { studyId: "s-iat", status: "completed" },
      { studyId: "s-survey", status: "in_progress" },
    ]);
    expect(r.ok && r.progress.nextIndex).toBe(1);
  });

  it("un intento abandonado no cuenta y una sesión completa prevalece sobre una en curso", async () => {
    const t = baseTables();
    t.sessions = [
      { id: "c1", study_id: "s-iat", battery_session_id: "bs-1", status: "abandoned" },
      { id: "c2", study_id: "s-survey", battery_session_id: "bs-1", status: "started" },
      { id: "c3", study_id: "s-survey", battery_session_id: "bs-1", status: "completed" },
      { id: "c4", study_id: "s-survey", battery_session_id: "bs-1", status: "started" },
    ];
    const { battery, admin } = await loaded(t);
    const r = await batteryProgress(admin.client, battery, "bs-1");
    expect(r.ok && r.progress.steps.map((s) => s.status)).toEqual(["pending", "completed"]);
    expect(r.ok && r.progress.nextIndex).toBe(0);
  });

  it("no reconoce sesiones de otra batería ni inexistentes", async () => {
    const t = baseTables();
    t.battery_sessions!.push({ id: "bs-otra", battery_id: "bat-2", status: "started" });
    const { battery, admin } = await loaded(t);
    expect(await batteryProgress(admin.client, battery, "bs-otra")).toEqual({ ok: false, code: "not_found" });
    expect(await batteryProgress(admin.client, battery, "nada")).toEqual({ ok: false, code: "not_found" });
  });
});

describe("completeBattery", () => {
  it("cierra la sesión sólo si todos los pasos están completos", async () => {
    const t = baseTables();
    t.sessions = [{ id: "c1", study_id: "s-iat", battery_session_id: "bs-1", status: "completed" }];
    const { battery, admin } = await loaded(t);
    expect(await completeBattery(admin.client, battery, "bs-1")).toEqual({ ok: false, code: "incomplete", missing: ["s-survey"] });
    expect(t.battery_sessions![0]!.status).toBe("started");

    t.sessions!.push({ id: "c2", study_id: "s-survey", battery_session_id: "bs-1", status: "completed" });
    const now = new Date("2026-10-15T12:00:00Z");
    expect(await completeBattery(admin.client, battery, "bs-1", now)).toEqual({ ok: true });
    expect(t.battery_sessions![0]).toMatchObject({ status: "completed", completed_at: now.toISOString() });
  });

  it("es idempotente y no cierra sesiones abandonadas", async () => {
    const t = baseTables();
    t.battery_sessions![0]!.status = "completed";
    const { battery, admin } = await loaded(t);
    expect(await completeBattery(admin.client, battery, "bs-1")).toEqual({ ok: true });
    t.battery_sessions![0]!.status = "abandoned";
    expect(await completeBattery(admin.client, battery, "bs-1")).toEqual({ ok: false, code: "not_found" });
  });
});

describe("enlace de sesiones hijas", () => {
  it("autoriza sólo pasos activos de la misma batería y con la sesión en curso", async () => {
    const { admin } = await loaded();
    expect(await authorizeChildLink(admin.client, "s-iat", "bs-1")).toBe(true);
    expect(await authorizeChildLink(admin.client, "s-off", "bs-1")).toBe(false); // paso omitido
    expect(await authorizeChildLink(admin.client, "s-otro", "bs-1")).toBe(false); // no es paso
    expect(await authorizeChildLink(admin.client, "s-iat", "nada")).toBe(false);
    admin.tables.battery_sessions![0]!.status = "completed";
    expect(await authorizeChildLink(admin.client, "s-iat", "bs-1")).toBe(false);
  });

  it("cuelga la sesión hija y, si falla, la descarta", async () => {
    const t = baseTables();
    t.sessions = [{ id: "c1", study_id: "s-iat", status: "started" }];
    const { admin } = await loaded(t);
    expect(await attachChildSession(admin.client, "s-iat", "c1", "bs-1")).toBe(true);
    expect(t.sessions![0]!.battery_session_id).toBe("bs-1");

    expect(await attachChildSession(admin.client, "s-iat", "no-existe", "bs-1")).toBe(false);
    t.sessions!.push({ id: "c2", study_id: "otro", status: "started" });
    expect(await attachChildSession(admin.client, "s-iat", "c2", "bs-1")).toBe(false); // otro estudio: no se toca
    expect(t.sessions![1]!.battery_session_id).toBeUndefined();
  });
});

describe("versión del consentimiento", () => {
  it("cambia sólo si cambia el texto", () => {
    const a = { version: 1 as const, texts: { consent: "uno", thankYou: "g" } };
    expect(batteryConsentVersion(a)).toBe(batteryConsentVersion({ ...a, texts: { consent: "uno", thankYou: "otro" } }));
    expect(batteryConsentVersion(a)).not.toBe(batteryConsentVersion({ ...a, texts: { consent: "dos", thankYou: "g" } }));
    expect(batteryConsentVersion(a)).toMatch(/^bt-[0-9a-f]{12}$/);
  });
});
