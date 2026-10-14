import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkStepSession } from "@/lib/battery-link";
import type { ApiErrorCode } from "@/lib/participant-api";
import {
  buildAnswerSchema,
  scoreSurvey,
  SURVEY_ENGINE_VERSION,
  type SurveyConfig,
} from "./engine";

/**
 * Lógica de servidor del participante de una encuesta. Recibe el cliente de
 * Supabase por parámetro (en producción, el admin) para poder probarse sin red.
 * El servidor no confía en el cliente: valida las respuestas contra la
 * configuración y calcula él mismo las puntuaciones.
 */

/** Versión del consentimiento aceptado: cambia sola si el investigador edita el texto. */
export function surveyConsentVersion(config: SurveyConfig): string {
  return (
    "sv-" +
    createHash("sha256").update(config.texts.consent).digest("hex").slice(0, 12)
  );
}

export interface DeviceInput {
  inputMode: "keyboard" | "touch";
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  screenWidth: number;
  screenHeight: number;
}

export type StartResult =
  { ok: true; sessionId: string } | { ok: false; code: ApiErrorCode };

/** Abre la sesión de forma atómica (candado, límite de respuestas) reutilizando `claim_session`. */
export async function startSurveySession(
  admin: SupabaseClient,
  study: { id: string; config: SurveyConfig },
  input: {
    deviceId: string;
    ipHash: string | null;
    userAgent: string | null;
    device: DeviceInput;
    /** Si la encuesta es un paso de una batería, la sesión de batería a la que se enlaza. */
    batterySessionId?: string;
  },
): Promise<StartResult> {
  const { data, error } = await admin.rpc("claim_session", {
    p_study: study.id,
    p_device_id: input.deviceId,
    p_ip_hash: input.ipHash,
    p_user_agent: input.userAgent,
    p_demographics: {},
    p_explicit: null,
    p_consent_version: surveyConsentVersion(study.config),
    p_counterbalance: [],
    p_input_mode: input.device.inputMode,
    p_device_type: input.device.deviceType,
    p_screen_width: input.device.screenWidth,
    p_screen_height: input.device.screenHeight,
  });
  if (error) return { ok: false, code: "server_error" };

  const row = (
    data as { outcome: string; new_session_id: string | null }[] | null
  )?.[0];
  switch (row?.outcome) {
    case "ok": {
      if (!row.new_session_id) return { ok: false, code: "server_error" };
      // Dentro de una batería: la base de datos valida el paso y el orden; si no se puede, no deja sesión huérfana.
      if (input.batterySessionId) {
        const linked = await linkStepSession(
          admin,
          row.new_session_id,
          input.batterySessionId,
        );
        if (!linked.ok) return { ok: false, code: linked.code };
      }
      return { ok: true, sessionId: row.new_session_id };
    }
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

export type SubmitResult =
  { ok: true } | { ok: false; code: ApiErrorCode; detail?: string };

/**
 * Valida y guarda las respuestas y cierra la sesión. Idempotente: reenviar sobre una
 * sesión ya completada responde bien sin tocar nada, y un reintento tras un fallo a
 * medias (respuestas guardadas, sesión sin cerrar) completa el cierre.
 */
export async function submitSurveyAnswers(
  admin: SupabaseClient,
  study: { id: string; config: SurveyConfig },
  sessionId: string,
  rawAnswers: unknown,
  now = new Date(),
): Promise<SubmitResult> {
  const { data: session, error } = await admin
    .from("sessions")
    .select("id, study_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!session || session.study_id !== study.id)
    return { ok: false, code: "not_found" };
  if (session.status === "completed") return { ok: true };
  if (session.status !== "started") return { ok: false, code: "not_found" };

  const parsed = buildAnswerSchema(study.config).safeParse(rawAnswers);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      code: "invalid_data",
      detail: issue ? `${issue.path.join(".")}: ${issue.message}` : undefined,
    };
  }
  const answers = parsed.data;

  const { error: saveError } = await admin.from("survey_answers").upsert(
    {
      session_id: session.id,
      study_id: study.id,
      answers,
      scores: scoreSurvey(study.config, answers),
      engine_version: SURVEY_ENGINE_VERSION,
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
