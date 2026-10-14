import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/lib/participant-api";
import { iatConfigSchema, type IatConfig } from "@/tools/iat/config";
import { surveyConfigSchema, type SurveyConfig } from "@/tools/survey/engine";
import {
  isBatteryComplete,
  stepProgress,
  type BatteryConfig,
  type StepProgress,
} from "./engine";

/**
 * Lógica de servidor del participante de una batería. Recibe el cliente de Supabase por parámetro
 * (en producción, el admin) para poder probarse sin red. El servidor no confía en el cliente: el
 * progreso se DERIVA de las sesiones de los pasos y el orden lo impone la base de datos.
 */

/** Versión del consentimiento aceptado: cambia sola si el investigador edita el texto. */
export function batteryConsentVersion(config: BatteryConfig): string {
  return (
    "bv-" +
    createHash("sha256").update(config.texts.consent).digest("hex").slice(0, 12)
  );
}

export type StartResult =
  | { ok: true; sessionId: string; resumed: boolean }
  | { ok: false; code: ApiErrorCode };

/** Abre (o reanuda) la sesión de batería de forma atómica con `claim_battery_session`. */
export async function startBatterySession(
  admin: SupabaseClient,
  battery: { id: string; config: BatteryConfig },
  input: {
    deviceId: string;
    ipHash: string | null;
    userAgent: string | null;
    deviceType: string;
  },
): Promise<StartResult> {
  const { data, error } = await admin.rpc("claim_battery_session", {
    p_battery: battery.id,
    p_device_id: input.deviceId,
    p_ip_hash: input.ipHash,
    p_user_agent: input.userAgent,
    p_consent_version: batteryConsentVersion(battery.config),
    p_device_type: input.deviceType,
  });
  if (error) return { ok: false, code: "server_error" };

  const row = (
    data as { outcome: string; new_session_id: string | null }[] | null
  )?.[0];
  switch (row?.outcome) {
    case "ok":
    case "resumed":
      return row.new_session_id
        ? {
            ok: true,
            sessionId: row.new_session_id,
            resumed: row.outcome === "resumed",
          }
        : { ok: false, code: "server_error" };
    case "already_participated":
      return { ok: false, code: "already_participated" };
    case "full":
      return { ok: false, code: "full" };
    case "closed":
      return { ok: false, code: "closed" };
    case "not_published":
    case "not_found":
    case "no_steps":
      return { ok: false, code: "not_available" };
    default:
      return { ok: false, code: "server_error" };
  }
}

/**
 * Un paso listo para correr: qué herramienta es, con qué liga se abre y su configuración (la misma
 * que el participante ve al abrir esa liga por separado).
 */
export type StepLink =
  | { studyId: string; tool: "iat"; token: string; config: IatConfig }
  | { studyId: string; tool: "survey"; token: string; config: SurveyConfig };

export interface BatteryProgress {
  /** Estado de la sesión de batería. */
  status: "started" | "completed" | "abandoned";
  /** Pasos en el orden que corre ESTE participante (fijado al iniciar). */
  steps: StepLink[];
  progress: StepProgress[];
  complete: boolean;
}

export type ProgressResult =
  { ok: true; value: BatteryProgress } | { ok: false; code: ApiErrorCode };

type StepLinksResult =
  { ok: true; steps: StepLink[] } | { ok: false; code: ApiErrorCode };

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** Pasos (en el orden dado) con su liga y su configuración validada. */
export async function loadStepLinks(
  admin: SupabaseClient,
  order: readonly string[],
): Promise<StepLinksResult> {
  if (order.length === 0) return { ok: true, steps: [] };
  const { data, error } = await admin
    .from("studies")
    .select("id, tool_type, access_token, config")
    .in("id", [...order]);
  if (error) return { ok: false, code: "server_error" };

  const byId = new Map((data ?? []).map((s) => [s.id as string, s]));
  const steps: StepLink[] = [];
  for (const studyId of order) {
    const s = byId.get(studyId);
    if (!s || typeof s.access_token !== "string")
      return { ok: false, code: "server_error" };
    if (s.tool_type === "iat") {
      const config = iatConfigSchema.safeParse(s.config);
      if (!config.success) return { ok: false, code: "server_error" };
      steps.push({
        studyId,
        tool: "iat",
        token: s.access_token,
        config: config.data,
      });
    } else if (s.tool_type === "survey") {
      const config = surveyConfigSchema.safeParse(s.config);
      if (!config.success) return { ok: false, code: "server_error" };
      steps.push({
        studyId,
        tool: "survey",
        token: s.access_token,
        config: config.data,
      });
    } else {
      return { ok: false, code: "server_error" };
    }
  }
  return { ok: true, steps };
}

/** Pasos activos de la batería en su orden actual, para la vista previa del investigador (no guarda nada). */
export async function loadPreviewSteps(
  admin: SupabaseClient,
  batteryId: string,
): Promise<StepLinksResult> {
  const { data, error } = await admin
    .from("battery_steps")
    .select("study_id, position, enabled")
    .eq("battery_id", batteryId)
    .order("position");
  if (error) return { ok: false, code: "server_error" };
  const order = (data ?? [])
    .filter((s) => s.enabled)
    .map((s) => s.study_id as string);
  return loadStepLinks(admin, order);
}

/** Progreso de una sesión de batería, derivado de las sesiones de sus pasos. */
export async function loadBatteryProgress(
  admin: SupabaseClient,
  batteryId: string,
  batterySessionId: string,
): Promise<ProgressResult> {
  const { data: bs, error } = await admin
    .from("battery_sessions")
    .select("id, battery_id, status, run_order")
    .eq("id", batterySessionId)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  // La sesión debe existir y pertenecer a ESTA batería (el token).
  if (!bs || bs.battery_id !== batteryId)
    return { ok: false, code: "not_found" };
  if (!isStringArray(bs.run_order)) return { ok: false, code: "server_error" };
  const order: string[] = bs.run_order;

  const [links, children] = await Promise.all([
    loadStepLinks(admin, order),
    admin
      .from("sessions")
      .select("study_id, status")
      .eq("battery_session_id", bs.id),
  ]);
  if (!links.ok) return { ok: false, code: links.code };
  if (children.error) return { ok: false, code: "server_error" };

  const progress = stepProgress(
    order,
    (children.data ?? []).map((c) => ({
      studyId: c.study_id as string,
      status: c.status as string,
    })),
  );
  return {
    ok: true,
    value: {
      status: bs.status as BatteryProgress["status"],
      steps: links.steps,
      progress,
      complete: bs.status === "completed" || isBatteryComplete(progress),
    },
  };
}

export type CompleteResult = { ok: true } | { ok: false; code: ApiErrorCode };

/** Cierra la sesión de batería si TODOS sus pasos están completados (lo decide la base de datos). */
export async function completeBatterySession(
  admin: SupabaseClient,
  batteryId: string,
  batterySessionId: string,
): Promise<CompleteResult> {
  const { data: bs, error } = await admin
    .from("battery_sessions")
    .select("id, battery_id")
    .eq("id", batterySessionId)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!bs || bs.battery_id !== batteryId)
    return { ok: false, code: "not_found" };

  const { data, error: rpcError } = await admin.rpc(
    "complete_battery_session",
    { p_battery_session: bs.id },
  );
  if (rpcError) return { ok: false, code: "server_error" };
  switch (data) {
    case "ok":
      return { ok: true };
    case "incomplete":
      return { ok: false, code: "incomplete" };
    case "not_found":
      return { ok: false, code: "not_found" };
    default:
      return { ok: false, code: "server_error" };
  }
}
