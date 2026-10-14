import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  defaultConsentText,
  DEFAULT_THANK_YOU,
  instrumentItemId,
  type SurveyConfig,
} from "./engine";
import {
  startSurveySession,
  submitSurveyAnswers,
  surveyConsentVersion,
} from "./participant";

const config: SurveyConfig = {
  version: 1,
  title: "Encuesta de prueba",
  texts: {
    consent: defaultConsentText("Encuesta de prueba"),
    thankYou: DEFAULT_THANK_YOU,
  },
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [
        {
          type: "select",
          id: "frecuencia",
          prompt: "¿Con qué frecuencia compras?",
          required: true,
          options: ["Semanal", "Mensual"],
        },
        {
          type: "text",
          id: "comentario",
          prompt: "Comentarios",
          required: false,
        },
      ],
    },
    { kind: "instrument", id: "sus", instrumentId: "sus", required: true },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};
const study = { id: "study-1", config };

function goodAnswers(overrides: Record<string, unknown> = {}) {
  const a: Record<string, unknown> = {
    frecuencia: "Semanal",
    nps_1: 10,
    ...overrides,
  };
  [5, 1, 5, 1, 5, 1, 5, 1, 5, 1].forEach((v, i) => {
    a[instrumentItemId("sus", i + 1)] = v;
  });
  return a;
}

interface SessionRow {
  id: string;
  study_id: string;
  status: string;
  completed_at?: string;
}

/** Cliente de Supabase falso en memoria: sólo lo que usa la lógica del participante. */
function fakeAdmin(
  opts: {
    sessions?: SessionRow[];
    rpc?: { data: unknown; error: unknown };
    failOn?: "upsert" | "update" | "select";
  } = {},
) {
  const sessions = new Map((opts.sessions ?? []).map((s) => [s.id, { ...s }]));
  const answers = new Map<string, Record<string, unknown>>();
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  let updates = 0;

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return (
        opts.rpc ?? {
          data: [{ outcome: "ok", new_session_id: "sess-1" }],
          error: null,
        }
      );
    },
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () =>
                opts.failOn === "select"
                  ? { data: null, error: { message: "x" } }
                  : { data: sessions.get(id) ?? null, error: null },
            }),
          }),
          update: (patch: Partial<SessionRow>) => ({
            eq: (_c1: string, id: string) => ({
              eq: async (_c2: string, status: string) => {
                if (opts.failOn === "update")
                  return { error: { message: "x" } };
                const row = sessions.get(id);
                if (row && row.status === status) {
                  Object.assign(row, patch);
                  updates++;
                }
                return { error: null };
              },
            }),
          }),
        };
      }
      return {
        upsert: async (row: Record<string, unknown>) => {
          if (opts.failOn === "upsert") return { error: { message: "x" } };
          answers.set(row.session_id as string, row);
          return { error: null };
        },
      };
    },
  };
  return {
    admin: client as unknown as SupabaseClient,
    sessions,
    answers,
    rpcCalls,
    updates: () => updates,
  };
}

const device = {
  inputMode: "touch",
  deviceType: "mobile",
  screenWidth: 390,
  screenHeight: 844,
} as const;

describe("consentimiento", () => {
  it("la versión cambia sola cuando cambia el texto y es estable si no cambia", () => {
    const a = surveyConsentVersion(config);
    expect(a).toMatch(/^sv-[0-9a-f]{12}$/);
    expect(surveyConsentVersion(config)).toBe(a);
    expect(
      surveyConsentVersion({
        ...config,
        texts: { ...config.texts, consent: config.texts.consent + " ." },
      }),
    ).not.toBe(a);
  });

  it("el texto por defecto es confidencial (no «anónimo») y exige 18 años o más", () => {
    const text = defaultConsentText("X");
    expect(text).toContain("confidencial");
    expect(text).not.toMatch(/anónim/i);
    expect(text).toContain("18 años o más");
  });
});

describe("inicio de sesión", () => {
  it("abre la sesión con claim_session y valores neutros del IAT", async () => {
    const { admin, rpcCalls } = fakeAdmin();
    const res = await startSurveySession(admin, study, {
      deviceId: "dev-1",
      ipHash: "h",
      userAgent: "ua",
      device,
    });
    expect(res).toEqual({ ok: true, sessionId: "sess-1" });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.name).toBe("claim_session");
    expect(rpcCalls[0]!.args).toMatchObject({
      p_study: "study-1",
      p_device_id: "dev-1",
      p_demographics: {},
      p_explicit: null,
      p_counterbalance: [],
      p_input_mode: "touch",
      p_consent_version: surveyConsentVersion(config),
    });
  });

  it.each([
    ["already_participated", "already_participated"],
    ["full", "full"],
    ["closed", "closed"],
    ["not_published", "not_available"],
    ["not_found", "not_available"],
    ["algo_raro", "server_error"],
  ])("resultado %s del candado → código %s", async (outcome, code) => {
    const { admin } = fakeAdmin({
      rpc: { data: [{ outcome, new_session_id: null }], error: null },
    });
    expect(
      await startSurveySession(admin, study, {
        deviceId: "d",
        ipHash: null,
        userAgent: null,
        device,
      }),
    ).toEqual({ ok: false, code });
  });

  it("error de la base o respuesta vacía → error de servidor", async () => {
    const failing = fakeAdmin({
      rpc: { data: null, error: { message: "boom" } },
    });
    expect(
      await startSurveySession(failing.admin, study, {
        deviceId: "d",
        ipHash: null,
        userAgent: null,
        device,
      }),
    ).toEqual({ ok: false, code: "server_error" });
    const empty = fakeAdmin({ rpc: { data: [], error: null } });
    expect(
      await startSurveySession(empty.admin, study, {
        deviceId: "d",
        ipHash: null,
        userAgent: null,
        device,
      }),
    ).toEqual({ ok: false, code: "server_error" });
  });
});

describe("envío de respuestas", () => {
  const started: SessionRow = {
    id: "sess-1",
    study_id: "study-1",
    status: "started",
  };

  it("valida, puntúa en el servidor, guarda y cierra la sesión", async () => {
    const fake = fakeAdmin({ sessions: [started] });
    const now = new Date("2026-10-14T12:00:00Z");
    const res = await submitSurveyAnswers(
      fake.admin,
      study,
      "sess-1",
      goodAnswers(),
      now,
    );
    expect(res).toEqual({ ok: true });

    const saved = fake.answers.get("sess-1")!;
    expect(saved).toMatchObject({
      session_id: "sess-1",
      study_id: "study-1",
      engine_version: "nf-survey-1.0",
    });
    expect(saved.scores).toEqual([
      {
        blockId: "sus",
        instrumentId: "sus",
        score: { instrument: "sus", score: 100 },
      },
      {
        blockId: "nps",
        instrumentId: "nps",
        score: { instrument: "nps", value: 10, category: "promoter" },
      },
    ]);
    expect(fake.sessions.get("sess-1")).toMatchObject({
      status: "completed",
      completed_at: "2026-10-14T12:00:00.000Z",
    });
  });

  it("ignora puntuaciones enviadas por el cliente (esquema estricto)", async () => {
    const fake = fakeAdmin({ sessions: [started] });
    const res = await submitSurveyAnswers(fake.admin, study, "sess-1", {
      ...goodAnswers(),
      scores: [{ score: 100 }],
    });
    expect(res).toMatchObject({ ok: false, code: "invalid_data" });
    expect(fake.answers.size).toBe(0);
    expect(fake.sessions.get("sess-1")!.status).toBe("started");
  });

  it("rechaza valores fuera de escala o faltantes y no guarda nada", async () => {
    const fake = fakeAdmin({ sessions: [started] });
    expect(
      await submitSurveyAnswers(
        fake.admin,
        study,
        "sess-1",
        goodAnswers({ nps_1: 11 }),
      ),
    ).toMatchObject({
      ok: false,
      code: "invalid_data",
      detail: expect.stringContaining("nps_1"),
    });
    const missing = goodAnswers();
    delete missing.sus_7;
    expect(
      await submitSurveyAnswers(fake.admin, study, "sess-1", missing),
    ).toMatchObject({ ok: false, code: "invalid_data" });
    expect(fake.answers.size).toBe(0);
  });

  it("una sesión de otro estudio o inexistente → no encontrada", async () => {
    const fake = fakeAdmin({
      sessions: [{ id: "otra", study_id: "study-2", status: "started" }],
    });
    expect(
      await submitSurveyAnswers(fake.admin, study, "otra", goodAnswers()),
    ).toEqual({ ok: false, code: "not_found" });
    expect(
      await submitSurveyAnswers(fake.admin, study, "no-existe", goodAnswers()),
    ).toEqual({ ok: false, code: "not_found" });
    expect(fake.answers.size).toBe(0);
  });

  it("una sesión abandonada no acepta respuestas", async () => {
    const fake = fakeAdmin({ sessions: [{ ...started, status: "abandoned" }] });
    expect(
      await submitSurveyAnswers(fake.admin, study, "sess-1", goodAnswers()),
    ).toEqual({ ok: false, code: "not_found" });
  });

  it("es idempotente: reenviar sobre una sesión completada no cambia nada", async () => {
    const fake = fakeAdmin({ sessions: [started] });
    await submitSurveyAnswers(fake.admin, study, "sess-1", goodAnswers());
    const before = JSON.stringify([...fake.answers]);
    const again = await submitSurveyAnswers(
      fake.admin,
      study,
      "sess-1",
      goodAnswers({ nps_1: 0 }),
    );
    expect(again).toEqual({ ok: true });
    expect(JSON.stringify([...fake.answers])).toBe(before);
    expect(fake.updates()).toBe(1);
  });

  it("un fallo al cerrar la sesión se puede reintentar sin duplicar respuestas", async () => {
    const fake = fakeAdmin({ sessions: [started], failOn: "update" });
    expect(
      await submitSurveyAnswers(fake.admin, study, "sess-1", goodAnswers()),
    ).toEqual({ ok: false, code: "server_error" });
    expect(fake.answers.size).toBe(1); // respuestas guardadas, sesión aún sin cerrar
    expect(fake.sessions.get("sess-1")!.status).toBe("started");

    const retry = fakeAdmin({ sessions: [fake.sessions.get("sess-1")!] });
    expect(
      await submitSurveyAnswers(retry.admin, study, "sess-1", goodAnswers()),
    ).toEqual({ ok: true });
    expect(retry.sessions.get("sess-1")!.status).toBe("completed");
  });

  it("errores de la base → error de servidor", async () => {
    expect(
      await submitSurveyAnswers(
        fakeAdmin({ sessions: [started], failOn: "select" }).admin,
        study,
        "sess-1",
        goodAnswers(),
      ),
    ).toEqual({ ok: false, code: "server_error" });
    const up = fakeAdmin({ sessions: [started], failOn: "upsert" });
    expect(
      await submitSurveyAnswers(up.admin, study, "sess-1", goodAnswers()),
    ).toEqual({ ok: false, code: "server_error" });
    expect(up.sessions.get("sess-1")!.status).toBe("started");
  });
});
