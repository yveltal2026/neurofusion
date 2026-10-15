import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { validVariantConfig } from "./defaults";
import { startVariantSession, submitVariantResponses, variantConsentVersion } from "./participant";
import { buildPlan, flatTrials, planHash, type VariantPlan } from "./plan";

const config = validVariantConfig("sc_iat");
const study = { id: "study-1", config };
const SID = "11111111-2222-4333-8444-555555555555";

interface SessionRow {
  id: string;
  study_id: string;
  status: string;
  completed_at?: string;
}

/** Cliente de Supabase falso en memoria: sólo lo que usa la lógica del participante. */
function fakeAdmin(opts: { sessions?: SessionRow[]; rpc?: { data: unknown; error: unknown }; failOn?: "upsert" | "update" | "select" } = {}) {
  const sessions = new Map((opts.sessions ?? []).map((s) => [s.id, { ...s }]));
  const results = new Map<string, Record<string, unknown>>();
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return opts.rpc ?? { data: [{ outcome: "ok", new_session_id: SID }], error: null };
    },
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => (opts.failOn === "select" ? { data: null, error: { message: "x" } } : { data: sessions.get(id) ?? null, error: null }),
            }),
          }),
          update: (patch: Partial<SessionRow>) => ({
            eq: (_c1: string, id: string) => ({
              eq: async (_c2: string, status: string) => {
                if (opts.failOn === "update") return { error: { message: "x" } };
                const row = sessions.get(id);
                if (row && row.status === status) Object.assign(row, patch);
                return { error: null };
              },
            }),
          }),
        };
      }
      return {
        upsert: async (row: Record<string, unknown>) => {
          if (opts.failOn === "upsert") return { error: { message: "x" } };
          results.set(row.session_id as string, row);
          return { error: null };
        },
      };
    },
  };
  return { admin: client as unknown as SupabaseClient, sessions, results, rpcCalls };
}

const device = { inputMode: "keyboard", deviceType: "desktop", screenWidth: 1280, screenHeight: 800 } as const;
const started = (): SessionRow => ({ id: SID, study_id: "study-1", status: "started" });

function goodSubmission(plan: VariantPlan = buildPlan(config, SID)) {
  return {
    planHash: planHash(plan),
    responses: flatTrials(plan).map(({ block, trial }, i) => ({
      seq: i,
      key: (trial as { correctSide: "left" | "right" }).correctSide,
      rtMs: block.practice ? 700 : 600 + (i % 9) * 15,
    })),
  };
}

describe("consentimiento", () => {
  it("la versión cambia sola cuando cambia el texto y es estable si no cambia", () => {
    const a = variantConsentVersion(config);
    expect(a).toMatch(/^vr-[0-9a-f]{12}$/);
    expect(variantConsentVersion(config)).toBe(a);
    expect(variantConsentVersion({ ...config, texts: { ...config.texts, consent: config.texts.consent + " ." } })).not.toBe(a);
  });

  it("el texto por defecto es confidencial (no «anónimo») y exige 18 años o más", () => {
    expect(config.texts.consent).toContain("confidencial");
    expect(config.texts.consent).not.toMatch(/anónim/i);
    expect(config.texts.consent).toContain("18 años o más");
  });
});

describe("inicio de sesión", () => {
  it("abre la sesión con claim_session y valores neutros", async () => {
    const { admin, rpcCalls } = fakeAdmin();
    const res = await startVariantSession(admin, study, { deviceId: "dev-1", ipHash: "h", userAgent: "ua", device });
    expect(res).toEqual({ ok: true, sessionId: SID });
    expect(rpcCalls[0]!.name).toBe("claim_session");
    expect(rpcCalls[0]!.args).toMatchObject({ p_study: "study-1", p_device_id: "dev-1", p_demographics: {}, p_counterbalance: [], p_consent_version: variantConsentVersion(config) });
  });

  it.each([
    ["already_participated", "already_participated"],
    ["full", "full"],
    ["closed", "closed"],
    ["not_published", "not_available"],
    ["not_found", "not_available"],
    ["algo_raro", "server_error"],
  ])("resultado %s del candado → código %s", async (outcome, code) => {
    const { admin } = fakeAdmin({ rpc: { data: [{ outcome, new_session_id: null }], error: null } });
    expect(await startVariantSession(admin, study, { deviceId: "d", ipHash: null, userAgent: null, device })).toEqual({ ok: false, code });
  });

  it("un error de la base de datos es server_error", async () => {
    const { admin } = fakeAdmin({ rpc: { data: null, error: { message: "x" } } });
    expect(await startVariantSession(admin, study, { deviceId: "d", ipHash: null, userAgent: null, device })).toEqual({ ok: false, code: "server_error" });
  });
});

describe("envío de respuestas", () => {
  it("valida contra el plan regenerado, guarda la puntuación del servidor y cierra la sesión", async () => {
    const { admin, sessions, results } = fakeAdmin({ sessions: [started()] });
    const res = await submitVariantResponses(admin, study, SID, goodSubmission(), new Date("2026-10-15T12:00:00Z"));
    expect(res).toEqual({ ok: true });
    const row = results.get(SID)!;
    expect(row).toMatchObject({ study_id: "study-1", variant: "sc_iat", engine_version: "nf-iat-variants-1.0" });
    expect((row.trials as unknown[]).length).toBe(192);
    expect(row.valid).toBe(true);
    expect(typeof row.primary_value).toBe("number");
    expect(sessions.get(SID)).toMatchObject({ status: "completed", completed_at: "2026-10-15T12:00:00.000Z" });
  });

  it("ignora cualquier puntuación o acierto que el cliente intente colar", async () => {
    const { admin, results } = fakeAdmin({ sessions: [started()] });
    const sub = { ...goodSubmission(), scores: { primary: 99 }, correct: true };
    expect(await submitVariantResponses(admin, study, SID, sub)).toEqual({ ok: true });
    expect(results.get(SID)!.primary_value).not.toBe(99);
  });

  it("rechaza un plan que no es el de la sesión (otro id de sesión)", async () => {
    const { admin, results } = fakeAdmin({ sessions: [started()] });
    const other = buildPlan(config, "99999999-2222-4333-8444-555555555555");
    const res = await submitVariantResponses(admin, study, SID, goodSubmission(other));
    expect(res).toMatchObject({ ok: false, code: "invalid_data" });
    expect(results.size).toBe(0);
  });

  it("rechaza respuestas mal formadas con detalle", async () => {
    const { admin } = fakeAdmin({ sessions: [started()] });
    expect(await submitVariantResponses(admin, study, SID, { planHash: "x", responses: [] })).toMatchObject({ ok: false, code: "invalid_data" });
    expect(await submitVariantResponses(admin, study, SID, null)).toMatchObject({ ok: false, code: "invalid_data" });
  });

  it("sesión inexistente, de otro estudio o abandonada → not_found", async () => {
    expect(await submitVariantResponses(fakeAdmin().admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "not_found" });
    expect(await submitVariantResponses(fakeAdmin({ sessions: [{ ...started(), study_id: "otro" }] }).admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "not_found" });
    expect(await submitVariantResponses(fakeAdmin({ sessions: [{ ...started(), status: "abandoned" }] }).admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "not_found" });
  });

  it("es idempotente: una sesión ya completada responde bien sin tocar nada", async () => {
    const { admin, results } = fakeAdmin({ sessions: [{ ...started(), status: "completed" }] });
    expect(await submitVariantResponses(admin, study, SID, goodSubmission())).toEqual({ ok: true });
    expect(results.size).toBe(0);
  });

  it("un fallo al guardar o al cerrar permite reintentar", async () => {
    const a = fakeAdmin({ sessions: [started()], failOn: "upsert" });
    expect(await submitVariantResponses(a.admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "server_error" });
    const b = fakeAdmin({ sessions: [started()], failOn: "update" });
    expect(await submitVariantResponses(b.admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "server_error" });
    expect(b.sessions.get(SID)!.status).toBe("started");
    const c = fakeAdmin({ sessions: [started()], failOn: "select" });
    expect(await submitVariantResponses(c.admin, study, SID, goodSubmission())).toEqual({ ok: false, code: "server_error" });
  });
});
