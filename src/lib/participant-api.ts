import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleToken } from "@/lib/magic-link";
import { iatConfigSchema, type IatConfig } from "@/tools/iat/config";
import { batteryConfigSchema, type BatteryConfig } from "@/tools/battery/engine";
import { surveyConfigSchema, type SurveyConfig } from "@/tools/survey/engine";

/** Códigos de error públicos que entiende el runner del participante. */
export type ApiErrorCode =
  | "invalid_link"
  | "not_available"
  | "closed"
  | "full"
  | "already_participated"
  | "invalid_data"
  | "rate_limited"
  | "incomplete"
  | "out_of_order"
  | "not_found"
  | "server_error";

const MESSAGES: Record<ApiErrorCode, string> = {
  invalid_link: "Esta liga no es válida.",
  not_available: "Este estudio no está disponible por ahora.",
  closed: "Este estudio ya cerró y no acepta más respuestas.",
  full: "Este estudio ya alcanzó el número de participantes que necesitaba. ¡Gracias por tu interés!",
  already_participated: "Ya participaste en este estudio desde este dispositivo. ¡Gracias!",
  invalid_data: "Los datos enviados no son válidos.",
  rate_limited: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  incomplete: "Faltan respuestas por registrar.",
  out_of_order: "Este paso aún no está disponible: termina primero el anterior.",
  not_found: "No encontramos tu sesión. Vuelve a empezar desde la liga.",
  server_error: "Ocurrió un error. Inténtalo de nuevo en unos minutos.",
};

const STATUS: Record<ApiErrorCode, number> = {
  invalid_link: 404,
  not_available: 403,
  closed: 403,
  full: 409,
  already_participated: 409,
  invalid_data: 422,
  rate_limited: 429,
  incomplete: 409,
  out_of_order: 409,
  not_found: 404,
  server_error: 500,
};

/** Mensaje en español para un código de error público. */
export function apiMessage(code: ApiErrorCode): string {
  return MESSAGES[code];
}

export function apiError(code: ApiErrorCode, extra: Record<string, unknown> = {}, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, code, message: MESSAGES[code], ...extra }, { status: STATUS[code], headers });
}

/** Herramientas que tienen participantes y, por tanto, liga mágica. */
export type ParticipantToolType = "iat" | "survey";

export interface ParticipantStudy<C> {
  id: string;
  status: "draft" | "published" | "closed";
  closes_at: string | null;
  duplicate_policy: "device_cookie" | "device_cookie_and_ip" | "none";
  config: C;
}

export type StudyForParticipant = ParticipantStudy<IatConfig>;
export type SurveyStudyForParticipant = ParticipantStudy<SurveyConfig>;

export type LoadResult<C> = { ok: true; study: ParticipantStudy<C> } | { ok: false; code: ApiErrorCode };
export type LoadStudyResult = LoadResult<IatConfig>;

/** Estudio hallado por token, con la configuración ya validada según su herramienta. */
export type LoadedParticipantStudy =
  | { ok: true; tool: "iat"; study: StudyForParticipant }
  | { ok: true; tool: "survey"; study: SurveyStudyForParticipant }
  | { ok: false; code: ApiErrorCode };

interface StudyRowForParticipant {
  id: string;
  tool_type: string;
  status: ParticipantStudy<unknown>["status"];
  closes_at: string | null;
  duplicate_policy: ParticipantStudy<unknown>["duplicate_policy"];
  config: unknown;
}

/** Busca el estudio por token de la liga mágica (cliente admin: ignora RLS). */
async function fetchStudyRow(
  token: string,
  toolTypes: readonly ParticipantToolType[],
): Promise<{ ok: true; row: StudyRowForParticipant } | { ok: false; code: ApiErrorCode }> {
  if (!isPlausibleToken(token)) return { ok: false, code: "invalid_link" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("studies")
    .select("id, tool_type, status, closes_at, duplicate_policy, config")
    .eq("access_token", token)
    .in("tool_type", [...toolTypes])
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!data) return { ok: false, code: "invalid_link" };
  return { ok: true, row: data as StudyRowForParticipant };
}

function toStudy<C>(row: StudyRowForParticipant, schema: z.ZodType<C>): LoadResult<C> {
  const config = schema.safeParse(row.config);
  if (!config.success) return { ok: false, code: "server_error" };
  return {
    ok: true,
    study: {
      id: row.id,
      status: row.status,
      closes_at: row.closes_at,
      duplicate_policy: row.duplicate_policy,
      config: config.data,
    },
  };
}

/** Estudio IAT por token. Un token de otra herramienta se trata como liga inválida. */
export async function loadStudyByToken(token: string): Promise<LoadStudyResult> {
  const found = await fetchStudyRow(token, ["iat"]);
  return found.ok ? toStudy(found.row, iatConfigSchema) : found;
}

/** Encuesta por token. Un token de otra herramienta se trata como liga inválida. */
export async function loadSurveyByToken(token: string): Promise<LoadResult<SurveyConfig>> {
  const found = await fetchStudyRow(token, ["survey"]);
  return found.ok ? toStudy(found.row, surveyConfigSchema) : found;
}

/** Estudio de cualquier herramienta con participantes, para decidir qué pantalla mostrar. */
export async function loadParticipantStudyByToken(token: string): Promise<LoadedParticipantStudy> {
  const found = await fetchStudyRow(token, ["iat", "survey"]);
  if (!found.ok) return found;
  if (found.row.tool_type === "survey") {
    const survey = toStudy(found.row, surveyConfigSchema);
    return survey.ok ? { ok: true, tool: "survey", study: survey.study } : survey;
  }
  const iat = toStudy(found.row, iatConfigSchema);
  return iat.ok ? { ok: true, tool: "iat", study: iat.study } : iat;
}

export type BatteryForParticipant = ParticipantStudy<BatteryConfig>;

/** Batería por token de su liga mágica (cliente admin: ignora RLS). */
export async function loadBatteryByToken(token: string): Promise<LoadResult<BatteryConfig>> {
  if (!isPlausibleToken(token)) return { ok: false, code: "invalid_link" };
  const { data, error } = await createAdminClient()
    .from("batteries")
    .select("id, status, closes_at, duplicate_policy, config")
    .eq("access_token", token)
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!data) return { ok: false, code: "invalid_link" };
  const config = batteryConfigSchema.safeParse(data.config);
  if (!config.success) return { ok: false, code: "server_error" };
  return {
    ok: true,
    study: {
      id: data.id,
      status: data.status,
      closes_at: data.closes_at,
      duplicate_policy: data.duplicate_policy,
      config: config.data,
    },
  };
}

/** Código de error si el estudio no acepta participantes ahora; null si está abierto. */
export function availabilityError(
  study: Pick<ParticipantStudy<unknown>, "status" | "closes_at">,
  now = new Date(),
): ApiErrorCode | null {
  if (study.status !== "published") return study.status === "closed" ? "closed" : "not_available";
  if (study.closes_at && new Date(study.closes_at) <= now) return "closed";
  return null;
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const noStore = { "Cache-Control": "no-store" } as const;
