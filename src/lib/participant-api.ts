import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleToken } from "@/lib/magic-link";
import { iatConfigSchema, type IatConfig } from "@/tools/iat/config";

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

export interface StudyForParticipant {
  id: string;
  status: "draft" | "published" | "closed";
  closes_at: string | null;
  duplicate_policy: "device_cookie" | "device_cookie_and_ip" | "none";
  config: IatConfig;
}

export type LoadStudyResult =
  | { ok: true; study: StudyForParticipant }
  | { ok: false; code: ApiErrorCode };

/** Busca el estudio por token de la liga mágica (cliente admin: ignora RLS). */
export async function loadStudyByToken(token: string): Promise<LoadStudyResult> {
  if (!isPlausibleToken(token)) return { ok: false, code: "invalid_link" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("studies")
    .select("id, status, closes_at, duplicate_policy, config")
    .eq("access_token", token)
    .eq("tool_type", "iat")
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!data) return { ok: false, code: "invalid_link" };
  const config = iatConfigSchema.safeParse(data.config);
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
export function availabilityError(study: Pick<StudyForParticipant, "status" | "closes_at">, now = new Date()): ApiErrorCode | null {
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
