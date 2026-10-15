import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/lib/participant-api";
import type { VariantConfig } from "./config";
import { buildPlan, flatTrials } from "./plan";
import { resolveResponses, scoreVariant, submissionSchema } from "./score";

/**
 * Lógica de servidor del participante de una variante del IAT. Recibe el cliente de Supabase por
 * parámetro (en producción, el admin) para poder probarse sin red. El servidor no confía en el
 * cliente: regenera el plan de la sesión, valida las respuestas contra él y calcula las
 * puntuaciones; del navegador sólo toma la tecla y la latencia de cada ensayo.
 */

/** Versión del consentimiento aceptado: cambia sola si el investigador edita el texto. */
export function variantConsentVersion(config: VariantConfig): string {
  return "vr-" + createHash("sha256").update(config.texts.consent).digest("hex").slice(0, 12);
}

export interface DeviceInput {
  inputMode: "keyboard" | "touch";
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  screenWidth: number;
  screenHeight: number;
}

export type StartResult = { ok: true; sessionId: string } | { ok: false; code: ApiErrorCode };

/** Abre la sesión de forma atómica (candado, límite de respuestas) reutilizando `claim_session`. */
export async function startVariantSession(
  admin: SupabaseClient,
  study: { id: string; config: VariantConfig },
  input: { deviceId: string; ipHash: string | null; userAgent: string | null; device: DeviceInput },
): Promise<StartResult> {
  const { data, error } = await admin.rpc("claim_session", {
    p_study: study.id,
    p_device_id: input.deviceId,
    p_ip_hash: input.ipHash,
    p_user_agent: input.userAgent,
    p_demographics: {},
    p_explicit: null,
    p_consent_version: variantConsentVersion(study.config),
    p_counterbalance: [],
    p_input_mode: input.device.inputMode,
    p_device_type: input.device.deviceType,
    p_screen_width: input.device.screenWidth,
    p_screen_height: input.device.screenHeight,
  });
  if (error) return { ok: false, code: "server_error" };

  const row = (data as { outcome: string; new_session_id: string | null }[] | null)?.[0];
  switch (row?.outcome) {
    case "ok":
      return row.new_session_id ? { ok: true, sessionId: row.new_session_id } : { ok: false, code: "server_error" };
    case "already_participated":
      return { ok: false, code: "already_participated" };
    case "full":
      return { ok: false, code: "full" };
    case "closed":
      return { ok: false, code: "closed" };
    case "not_published":
    case "not_found":
      return { ok: false, code: "not_available" };
    default:
      return { ok: false, code: "server_error" };
  }
}

export type SubmitResult = { ok: true } | { ok: false; code: ApiErrorCode; detail?: string };

/**
 * Valida y guarda las respuestas y cierra la sesión. Idempotente: reenviar sobre una sesión ya
 * completada responde bien sin tocar nada, y un reintento tras un fallo a medias (resultado
 * guardado, sesión sin cerrar) completa el cierre.
 */
export async function submitVariantResponses(
  admin: SupabaseClient,
  study: { id: string; config: VariantConfig },
  sessionId: string,
  rawSubmission: unknown,
  now = new Date(),
): Promise<SubmitResult> {
  const { data: session, error } = await admin.from("sessions").select("id, study_id, status").eq("id", sessionId).maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!session || session.study_id !== study.id) return { ok: false, code: "not_found" };
  if (session.status === "completed") return { ok: true };
  if (session.status !== "started") return { ok: false, code: "not_found" };

  const parsed = submissionSchema.safeParse(rawSubmission);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, code: "invalid_data", detail: issue ? `${issue.path.join(".")}: ${issue.message}` : undefined };
  }

  const plan = buildPlan(study.config, session.id);
  const resolved = resolveResponses(study.config, plan, parsed.data);
  if (!resolved.ok) return { ok: false, code: "invalid_data", detail: resolved.detail };

  const scores = scoreVariant(study.config, plan, resolved.trials);
  const blockOf = new Map(flatTrials(plan).map(({ block, trial }) => [trial.seq, block.id] as const));
  const trials = resolved.trials.map((t) => ({
    seq: t.seq,
    block: blockOf.get(t.seq),
    practice: t.practice,
    key: t.key,
    rtMs: t.rtMs,
    correct: t.correct,
  }));

  const { error: saveError } = await admin.from("variant_results").upsert(
    {
      session_id: session.id,
      study_id: study.id,
      variant: scores.variant,
      trials,
      scores,
      primary_value: scores.primary,
      valid: scores.valid,
      flags: scores.flags,
      engine_version: scores.engineVersion,
    },
    { onConflict: "session_id" },
  );
  if (saveError) return { ok: false, code: "server_error" };

  const { error: closeError } = await admin
    .from("sessions")
    .update({ status: "completed", completed_at: now.toISOString() })
    .eq("id", session.id)
    .eq("status", "started");
  if (closeError) return { ok: false, code: "server_error" };

  return { ok: true };
}
