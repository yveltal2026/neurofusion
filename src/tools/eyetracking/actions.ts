"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  createR2VideoUploadSession,
  MAX_VIDEO_FILE_BYTES,
  isR2VideoKeyForStudy,
  readR2Config,
} from "@/tools/visual/video/r2.server";
import { videoAoiSchema } from "@/tools/visual/video/schema";
import { createEyeStudySchema, eyeStudyConfigSchema, resolveEyeMediaType } from "./config";

export async function createEyeTrackingStudy(raw: unknown): Promise<{ error?: string }> {
  const parsed = createEyeStudySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { supabase } = await requireUser();
  // Reutiliza el almacenamiento de imágenes y conserva compatibilidad con estudios previos.
  const { data, error } = await supabase.from("studies").insert({
    project_id: parsed.data.projectId,
    tool_type: "visual",
    name: parsed.data.name,
    status: "published",
    config: parsed.data.config,
    access_token: generateMagicToken(),
  }).select("id").single();
  if (error || !data) return { error: "No se pudo crear el estudio. Verifica que el proyecto exista." };
  redirect(`/studies/${data.id}?created=1`);
}

async function videoIsLocked(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], studyId: string) {
  const [runs, active] = await Promise.all([
    supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", studyId),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("study_id", studyId).eq("status", "started")
      .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString()),
  ]);
  return Boolean(runs.error || active.error || runs.count || active.count);
}

const uploadRequestSchema = z.object({
  studyId: z.string().uuid(),
  mimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  byteLength: z.number().int().min(1_024).max(MAX_VIDEO_FILE_BYTES),
});

export async function requestResearcherVideoUpload(raw: unknown): Promise<{
  error?: string;
  storageKey?: string;
  uploadUrl?: string;
  playbackUrl?: string;
  requiredHeaders?: Record<string, string>;
}> {
  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: "El video debe ser MP4 o WebM de hasta 150 MB." };

  const r2Config = readR2Config();
  if (!r2Config) {
    return {
      error: "El almacenamiento de videos en el servidor aún no está activado por el administrador. Mientras tanto, vincula un enlace directo MP4/WebM.",
    };
  }

  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id, config")
    .eq("id", parsed.data.studyId)
    .eq("tool_type", "visual")
    .maybeSingle();

  const parsedConfig = eyeStudyConfigSchema.safeParse(study?.config);
  if (!study || !parsedConfig.success || resolveEyeMediaType(parsedConfig.data.eyeTracking) !== "video") {
    return { error: "No se encontró el estudio de video." };
  }
  if (await videoIsLocked(supabase, parsed.data.studyId)) {
    return { error: "El estudio ya tiene respuestas o sesiones en curso; el video y sus áreas quedaron fijados." };
  }

  const session = createR2VideoUploadSession(
    {
      studyId: parsed.data.studyId,
      assetId: randomUUID(),
      mimeType: parsed.data.mimeType,
      byteLength: parsed.data.byteLength,
    },
    r2Config,
  );

  return {
    storageKey: session.storageKey,
    uploadUrl: session.uploadUrl,
    playbackUrl: session.playbackUrl,
    requiredHeaders: session.requiredHeaders,
  };
}

const saveVideoSourceSchema = z.object({
  studyId: z.string().uuid(),
  r2Key: z.string().trim().min(1).max(500).optional(),
  playbackUrl: z.string().trim().url("URL de video inválida").max(2000).optional(),
  title: z.string().trim().max(160).optional(),
  videoWidth: z.number().int().min(64).max(7680).optional(),
  videoHeight: z.number().int().min(64).max(4320).optional(),
  durationMs: z.number().int().min(1000).max(300_000).optional(),
}).refine((d) => Boolean(d.r2Key || d.playbackUrl), {
  message: "Debes subir un video o indicar un enlace de reproducción válido.",
});

export async function saveStudyVideoSource(raw: unknown): Promise<{ error?: string; ok?: boolean }> {
  const parsed = saveVideoSourceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos de video inválidos" };

  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id, config")
    .eq("id", parsed.data.studyId)
    .eq("tool_type", "visual")
    .maybeSingle();

  const parsedConfig = eyeStudyConfigSchema.safeParse(study?.config);
  if (!study || !parsedConfig.success || resolveEyeMediaType(parsedConfig.data.eyeTracking) !== "video") {
    return { error: "No se encontró el estudio de video." };
  }
  if (await videoIsLocked(supabase, parsed.data.studyId)) {
    return { error: "El estudio ya tiene respuestas o sesiones en curso; el video y sus áreas quedaron fijados." };
  }

  if (parsed.data.r2Key && !isR2VideoKeyForStudy(parsed.data.r2Key, study.id)) {
    return { error: "El video no pertenece a este estudio." };
  }
  if (parsed.data.durationMs && parsed.data.durationMs > (parsedConfig.data.eyeTracking.video?.maxDurationSeconds ?? 120) * 1000) {
    return { error: "El video supera la duración máxima configurada para el estudio." };
  }

  const prevVideo = parsedConfig.data.eyeTracking.video ?? {
    storage: "cloudflare_r2" as const,
    maxDurationSeconds: 120,
    scenes: [],
    aois: [],
  };

  const nextConfig = {
    ...parsedConfig.data,
    eyeTracking: {
      ...parsedConfig.data.eyeTracking,
      video: {
        ...prevVideo,
        r2Key: parsed.data.r2Key,
        // Para R2 regenerar GET al abrir, sin persistir una URL temporal que caduca.
        playbackUrl: parsed.data.r2Key ? undefined : parsed.data.playbackUrl,
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.videoWidth ? { videoWidth: parsed.data.videoWidth } : {}),
        ...(parsed.data.videoHeight ? { videoHeight: parsed.data.videoHeight } : {}),
        ...(parsed.data.durationMs ? { durationMs: parsed.data.durationMs } : {}),
      },
    },
  };

  const { error } = await supabase
    .from("studies")
    .update({ config: nextConfig })
    .eq("id", parsed.data.studyId);

  if (error) return { error: "No se pudo guardar la configuración del video." };
  revalidatePath(`/studies/${parsed.data.studyId}`);
  revalidatePath(`/studies/${parsed.data.studyId}/eye`);
  return { ok: true };
}

const saveVideoAoisSchema = z.object({
  studyId: z.string().uuid(),
  aois: z.array(videoAoiSchema).max(30),
});

export async function saveStudyVideoAois(raw: unknown): Promise<{ error?: string; ok?: boolean }> {
  const parsed = saveVideoAoisSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "AOIs dinámicas inválidas" };

  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id, config")
    .eq("id", parsed.data.studyId)
    .eq("tool_type", "visual")
    .maybeSingle();

  const parsedConfig = eyeStudyConfigSchema.safeParse(study?.config);
  if (!study || !parsedConfig.success || resolveEyeMediaType(parsedConfig.data.eyeTracking) !== "video") {
    return { error: "No se encontró el estudio de video." };
  }
  if (await videoIsLocked(supabase, parsed.data.studyId)) {
    return { error: "El estudio ya tiene respuestas o sesiones en curso; el video y sus áreas quedaron fijados." };
  }

  const prevVideo = parsedConfig.data.eyeTracking.video ?? {
    storage: "cloudflare_r2" as const,
    maxDurationSeconds: 120,
    scenes: [],
    aois: [],
  };

  const nextConfig = {
    ...parsedConfig.data,
    eyeTracking: {
      ...parsedConfig.data.eyeTracking,
      video: {
        ...prevVideo,
        aois: parsed.data.aois,
      },
    },
  };

  const { error } = await supabase
    .from("studies")
    .update({ config: nextConfig })
    .eq("id", parsed.data.studyId);

  if (error) return { error: "No se pudieron guardar las AOIs del video." };
  revalidatePath(`/studies/${parsed.data.studyId}`);
  revalidatePath(`/studies/${parsed.data.studyId}/eye`);
  return { ok: true };
}
