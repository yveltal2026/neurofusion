import type { StudyRow } from "@/lib/db/types";
import { isPlausibleToken } from "@/lib/magic-link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  webEyetrackingConfigSchema,
  type WebEyetrackingConfig,
} from "./config";

export interface LoadedWebEyeStudy {
  study: StudyRow;
  config: WebEyetrackingConfig;
}

export async function loadWebEyeStudyByToken(
  token: string,
): Promise<LoadedWebEyeStudy | null> {
  if (!isPlausibleToken(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("studies")
    .select("*")
    .eq("access_token", token)
    .eq("tool_type", "web_eyetracking")
    .maybeSingle<StudyRow>();
  if (!data) return null;
  const parsed = webEyetrackingConfigSchema.safeParse(data.config);
  if (!parsed.success) return null;
  return { study: data, config: parsed.data };
}

export function resolveAllowedCorsOrigin(
  requestOrigin: string | null,
  allowedOrigins: string[],
): string | null {
  if (!requestOrigin) return null;
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

export function buildCorsHeaders(origin: string | null): HeadersInit {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
