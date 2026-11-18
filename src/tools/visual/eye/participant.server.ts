import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleToken } from "@/lib/magic-link";
import type { ApiErrorCode } from "@/lib/participant-api";
import {
  isEyeFacialCodingEnabled,
  resolveEyeMediaType,
  visualConfigSchema,
  type EyeTrackingConfig,
  type PiecesConfig,
} from "../config";
import { assetUrls } from "../results";
import { readR2Config, resolveR2PlaybackUrl, isR2VideoKeyForStudy } from "../video/r2.server";
import type { VideoAoi, VideoScene } from "../video/schema";

export interface EyeStudyAsset {
  id: string;
  title: string;
  url: string;
}

export interface EyeVideoStimulus {
  assetId: string;
  title: string;
  playbackUrl: string;
  maxDurationSeconds: number;
  durationMs: number;
  facialCoding: boolean;
  scenes: VideoScene[];
  aois: VideoAoi[];
}

export interface EyeParticipantStudy {
  id: string;
  name: string;
  status: "draft" | "published" | "closed";
  closes_at: string | null;
  duplicate_policy: "device_cookie" | "device_cookie_and_ip" | "none";
  config: PiecesConfig & { eyeTracking: EyeTrackingConfig };
  assets: EyeStudyAsset[];
  video?: EyeVideoStimulus;
}

type LoadResult = { ok: true; study: EyeParticipantStudy } | { ok: false; code: ApiErrorCode };

/** La clave de service role sólo se usa aquí; al navegador se envían URLs firmadas de piezas concretas. */
export async function loadEyeStudyByToken(token: string, signMedia = false): Promise<LoadResult> {
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

  const eyeTracking = parsed.data.eyeTracking;
  const mediaType = resolveEyeMediaType(eyeTracking);

  if (mediaType === "video") {
    const videoCfg = eyeTracking.video;
    if (!videoCfg || (!videoCfg.r2Key && !videoCfg.playbackUrl)) {
      return { ok: false, code: "not_available" };
    }

    if (videoCfg.r2Key && !isR2VideoKeyForStudy(videoCfg.r2Key, data.id)) return { ok: false, code: "not_available" };
    let playbackUrl = videoCfg.playbackUrl ?? "";
    if (signMedia && videoCfg.r2Key) {
      const r2Config = readR2Config();
      if (r2Config) {
        playbackUrl = resolveR2PlaybackUrl({
          config: r2Config,
          key: videoCfg.r2Key,
          expiresInSeconds: 3600,
        });
      }
    }
    if (signMedia && !playbackUrl) {
      return { ok: false, code: "not_available" };
    }

    return {
      ok: true,
      study: {
        id: data.id,
        name: data.name,
        status: data.status,
        closes_at: data.closes_at,
        duplicate_policy: data.duplicate_policy,
        config: { ...parsed.data, eyeTracking },
        assets: [],
        video: {
          assetId: data.id,
          title: videoCfg.title || data.name,
          playbackUrl,
          maxDurationSeconds: videoCfg.maxDurationSeconds,
          durationMs: videoCfg.durationMs ?? videoCfg.maxDurationSeconds * 1000,
          facialCoding: isEyeFacialCodingEnabled(eyeTracking),
          scenes: videoCfg.scenes,
          aois: videoCfg.aois,
        },
      },
    };
  }

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
  if (signMedia) {
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
      config: { ...parsed.data, eyeTracking },
      assets: rows.map((r) => ({ id: r.id, title: r.title, url: urls[r.storage_path] ?? "" })),
    },
  };
}
