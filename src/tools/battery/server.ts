import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/lib/participant-api";
import { iatConfigSchema, type IatConfig } from "@/tools/iat/config";
import { surveyConfigSchema, type SurveyConfig } from "@/tools/survey/engine";
import { batteryConfigSchema, type BatteryConfig, type StepTool } from "./engine/config";

/**
 * Lógica de servidor del participante de una batería. Recibe el cliente de Supabase por parámetro (en
 * producción, el admin) para poder probarse sin red. El servidor no confía en el cliente: el avance de
 * cada paso se DERIVA de las sesiones hijas guardadas, no de lo que diga el navegador.
 */

export type BatteryStep =
  | { position: number; studyId: string; tool: "iat"; name: string; status: StudyStatus; token: string; config: IatConfig }
  | { position: number; studyId: string; tool: "survey"; name: string; status: StudyStatus; token: string; config: SurveyConfig };

type StudyStatus = "draft" | "published" | "closed";

export interface ParticipantBattery {
  id: string;
  name: string;
  status: StudyStatus;
  closes_at: string | null;
  duplicate_policy: "device_cookie" | "device_cookie_and_ip" | "none";
  config: BatteryConfig;
  /** Sólo los pasos activos, en el orden guardado: lo único que corre el participante. */
  steps: BatteryStep[];
}

export type LoadBatteryResult = { ok: true; battery: ParticipantBattery } | { ok: false; code: ApiErrorCode };

interface BatteryRow {
  id: string;
  name: string;
  status: StudyStatus;
  closes_at: string | null;
  duplicate_policy: ParticipantBattery["duplicate_policy"];
  config: unknown;
}
interface StepRow {
  position: number;
  enabled: boolean;
  study_id: string;
}
interface StudyRow {
  id: string;
  tool_type: string;
  name: string;
  status: StudyStatus;
  access_token: string | null;
  config: unknown;
}

/** Carga la batería por su token, con sus pasos activos y la configuración de cada estudio ya validada. */
export async function loadBatteryByToken(admin: SupabaseClient, token: string): Promise<LoadBatteryResult> {
  const { data: battery, error } = await admin
    .from("batteries")
    .select("id, name, status, closes_at, duplicate_policy, config")
    .eq("access_token", token)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!battery) return { ok: false, code: "invalid_link" };
  const b = battery as BatteryRow;

  const config = batteryConfigSchema.safeParse(b.config);
  if (!config.success) return { ok: false, code: "server_error" };

  const { data: stepRows, error: stepsError } = await admin
    .from("battery_steps")
    .select("position, enabled, study_id")
    .eq("battery_id", b.id)
    .order("position", { ascending: true });
  if (stepsError) return { ok: false, code: "server_error" };
  const active = ((stepRows ?? []) as StepRow[]).filter((s) => s.enabled);

  const studies = new Map<string, StudyRow>();
  if (active.length) {
    const { data: studyRows, error: studiesError } = await admin
      .from("studies")
      .select("id, tool_type, name, status, access_token, config")
      .in(
        "id",
        active.map((s) => s.study_id),
      );
    if (studiesError) return { ok: false, code: "server_error" };
    for (const s of (studyRows ?? []) as StudyRow[]) studies.set(s.id, s);
  }

  const steps: BatteryStep[] = [];
  for (const s of active) {
    const study = studies.get(s.study_id);
    if (!study || !study.access_token) return { ok: false, code: "server_error" };
    const common = { position: s.position, studyId: study.id, name: study.name, status: study.status, token: study.access_token };
    if (study.tool_type === "iat") {
      const parsed = iatConfigSchema.safeParse(study.config);
      if (!parsed.success) return { ok: false, code: "server_error" };
      steps.push({ ...common, tool: "iat", config: parsed.data });
    } else if (study.tool_type === "survey") {
      const parsed = surveyConfigSchema.safeParse(study.config);
      if (!parsed.success) return { ok: false, code: "server_error" };
      steps.push({ ...common, tool: "survey", config: parsed.data });
    } else {
      return { ok: false, code: "server_error" };
    }
  }

  return {
    ok: true,
    battery: { id: b.id, name: b.name, status: b.status, closes_at: b.closes_at, duplicate_policy: b.duplicate_policy, config: config.data, steps },
  };
}

// ---------------------------------------------------------------- alta de la sesión

export interface DeviceInput {
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
}

export type StartBatteryResult = { ok: true; batterySessionId: string } | { ok: false; code: ApiErrorCode };

/**
 * Abre la sesión de batería de forma atómica (candado, límite de respuestas) con `claim_battery_session`.
 * Antes comprueba que todos los pasos activos estén publicados: así nadie empieza una batería que no puede terminar.
 */
export async function startBatterySession(
  admin: SupabaseClient,
  battery: ParticipantBattery,
  input: { deviceId: string; ipHash: string | null; userAgent: string | null; deviceType: DeviceInput["deviceType"]; consentVersion: string },
): Promise<StartBatteryResult> {
  if (battery.steps.length === 0) return { ok: false, code: "not_available" };
  if (battery.steps.some((s) => s.status !== "published")) return { ok: false, code: "not_available" };

  const { data, error } = await admin.rpc("claim_battery_session", {
    p_battery: battery.id,
    p_device_id: input.deviceId,
    p_ip_hash: input.ipHash,
    p_user_agent: input.userAgent,
    p_consent_version: input.consentVersion,
    p_device_type: input.deviceType,
    p_run_order: battery.steps.map((s) => s.studyId),
  });
  if (error) return { ok: false, code: "server_error" };

  const row = (data as { outcome: string; new_session_id: string | null }[] | null)?.[0];
  switch (row?.outcome) {
    case "ok":
      return row.new_session_id ? { ok: true, batterySessionId: row.new_session_id } : { ok: false, code: "server_error" };
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

// ---------------------------------------------------------------- avance

export type StepStatus = "completed" | "in_progress" | "pending";

export interface BatteryProgress {
  sessionStatus: "started" | "completed" | "abandoned";
  steps: { studyId: string; status: StepStatus }[];
  /** Índice del primer paso sin completar; null si todos están completos. */
  nextIndex: number | null;
}

type ProgressResult = { ok: true; progress: BatteryProgress } | { ok: false; code: ApiErrorCode };

/** Estado de cada paso, derivado de las sesiones hijas ligadas a la sesión de batería (no de lo que diga el cliente). */
export async function batteryProgress(admin: SupabaseClient, battery: ParticipantBattery, batterySessionId: string): Promise<ProgressResult> {
  const { data: bs, error } = await admin
    .from("battery_sessions")
    .select("id, battery_id, status")
    .eq("id", batterySessionId)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  const session = bs as { id: string; battery_id: string; status: BatteryProgress["sessionStatus"] } | null;
  if (!session || session.battery_id !== battery.id) return { ok: false, code: "not_found" };

  const { data: children, error: childError } = await admin
    .from("sessions")
    .select("study_id, status")
    .eq("battery_session_id", batterySessionId);
  if (childError) return { ok: false, code: "server_error" };

  const byStudy = new Map<string, StepStatus>();
  for (const c of (children ?? []) as { study_id: string; status: string }[]) {
    const prev = byStudy.get(c.study_id);
    if (c.status === "completed") byStudy.set(c.study_id, "completed");
    else if (c.status === "started" && prev !== "completed") byStudy.set(c.study_id, "in_progress");
  }
  const steps = battery.steps.map((s) => ({ studyId: s.studyId, status: byStudy.get(s.studyId) ?? ("pending" as const) }));
  const next = steps.findIndex((s) => s.status !== "completed");
  return { ok: true, progress: { sessionStatus: session.status, steps, nextIndex: next === -1 ? null : next } };
}

/**
 * Cierra la sesión de batería: verifica en el servidor que todos los pasos están completos. Idempotente.
 */
export async function completeBattery(
  admin: SupabaseClient,
  battery: ParticipantBattery,
  batterySessionId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; code: ApiErrorCode; missing?: string[] }> {
  const result = await batteryProgress(admin, battery, batterySessionId);
  if (!result.ok) return result;
  const { progress } = result;
  if (progress.sessionStatus === "completed") return { ok: true };
  if (progress.sessionStatus !== "started") return { ok: false, code: "not_found" };
  const missing = progress.steps.filter((s) => s.status !== "completed").map((s) => s.studyId);
  if (missing.length) return { ok: false, code: "incomplete", missing };

  const { error } = await admin
    .from("battery_sessions")
    .update({ status: "completed", completed_at: now.toISOString() })
    .eq("id", batterySessionId)
    .eq("status", "started");
  return error ? { ok: false, code: "server_error" } : { ok: true };
}

// ---------------------------------------------------------------- enlace de las sesiones hijas

/**
 * ¿Puede una sesión nueva de `studyId` colgarse de esta sesión de batería? Exige que la sesión de batería
 * esté en curso y que el estudio sea un paso ACTIVO de la misma batería.
 */
export async function authorizeChildLink(admin: SupabaseClient, studyId: string, batterySessionId: string): Promise<boolean> {
  const { data: bs, error } = await admin.from("battery_sessions").select("id, battery_id, status").eq("id", batterySessionId).maybeSingle();
  const session = bs as { battery_id: string; status: string } | null;
  if (error || !session || session.status !== "started") return false;
  const { data: step, error: stepError } = await admin
    .from("battery_steps")
    .select("study_id")
    .eq("battery_id", session.battery_id)
    .eq("study_id", studyId)
    .eq("enabled", true)
    .maybeSingle();
  return !stepError && Boolean(step);
}

/** Cuelga la sesión hija de la de batería. Si falla, la hija se descarta para no dejar datos sueltos. */
export async function attachChildSession(admin: SupabaseClient, studyId: string, sessionId: string, batterySessionId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("sessions")
    .update({ battery_session_id: batterySessionId })
    .eq("id", sessionId)
    .eq("study_id", studyId)
    .select("id");
  if (error || !data?.length) {
    await admin.from("sessions").update({ status: "abandoned" }).eq("id", sessionId);
    return false;
  }
  return true;
}

/** Versión del consentimiento de la batería: cambia sola si el investigador edita el texto. */
export function batteryConsentVersion(config: BatteryConfig): string {
  return "bt-" + createHash("sha256").update(config.texts.consent).digest("hex").slice(0, 12);
}
