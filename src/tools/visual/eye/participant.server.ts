import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleToken } from "@/lib/magic-link";
import type { ApiErrorCode } from "@/lib/participant-api";
import { visualConfigSchema, type PiecesConfig } from "../config";
import { assetUrls } from "../results";

export interface EyeStudyAsset {
  id: string;
  title: string;
  url: string;
}

export interface EyeParticipantStudy {
  id: string;
  name: string;
  status: "draft" | "published" | "closed";
  closes_at: string | null;
  duplicate_policy: "device_cookie" | "device_cookie_and_ip" | "none";
  config: PiecesConfig & { eyeTracking: { durationSeconds: number } };
  assets: EyeStudyAsset[];
}

type LoadResult = { ok: true; study: EyeParticipantStudy } | { ok: false; code: ApiErrorCode };

/** La clave de service role sólo se usa aquí; al navegador se envían URLs firmadas de piezas concretas. */
export async function loadEyeStudyByToken(token: string, signImages = false): Promise<LoadResult> {
  if (!isPlausibleToken(token)) return { ok: false, code: "invalid_link" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("studies")
    .select("id, name, status, closes_at, duplicate_policy, config")
    .eq("access_token", token)
    .eq("tool_type", "visual")
    .maybeSingle();
  if (error) return { ok: false, code: "server_error" };
  if (!data) return { ok: false, code: "invalid_link" };
  const parsed = visualConfigSchema.safeParse(data.config);
  if (!parsed.success || parsed.data.mode !== "pieces" || !parsed.data.eyeTracking) return { ok: false, code: "invalid_link" };

  const { data: rows, error: assetsError } = await admin
    .from("visual_assets")
    .select("id, title, storage_path")
    .eq("study_id", data.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (assetsError) return { ok: false, code: "server_error" };
  if (!rows?.length) return { ok: false, code: "not_available" };
  if (rows.length > 5) return { ok: false, code: "server_error" };

  let urls: Record<string, string> = {};
  if (signImages) {
    urls = await assetUrls(admin, rows.map((r) => r.storage_path), "view");
    if (rows.some((r) => !urls[r.storage_path])) return { ok: false, code: "server_error" };
  }

  return {
    ok: true,
    study: {
      id: data.id,
      name: data.name,
      status: data.status,
      closes_at: data.closes_at,
      duplicate_policy: data.duplicate_policy,
      config: { ...parsed.data, eyeTracking: parsed.data.eyeTracking },
      assets: rows.map((r) => ({ id: r.id, title: r.title, url: urls[r.storage_path] ?? "" })),
    },
  };
}
