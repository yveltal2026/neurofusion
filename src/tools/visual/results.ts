import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { VisualAssetRow } from "@/lib/db/types";
import { ASSETS_BUCKET } from "@/lib/study-files";
import { pieceAiSchema, type PieceAiResult } from "./analysis/piece";
import { aoiListSchema, type Aoi } from "./engine/aoi";
import type { ImageMetrics } from "./engine/metrics";

/** Lo que se guarda en visual_assets.ai_result. */
export const storedAiSchema = z.object({
  result: pieceAiSchema,
  aois: aoiListSchema,
  coverage: z.number().min(0).max(1),
  tiles: z.number().int().min(1),
});
export type StoredAi = z.infer<typeof storedAiSchema>;

export interface StoredMetrics extends ImageMetrics {
  textContrast?: { id: string; label: string; ratio: number }[];
}

export interface VisualAsset {
  row: VisualAssetRow;
  aois: Aoi[];
  ai: (StoredAi & { provider: string | null; model: string | null; generatedAt: string | null; engineVersion: string | null }) | null;
  metrics: StoredMetrics | null;
  result: PieceAiResult | null;
}

export function toVisualAsset(row: VisualAssetRow): VisualAsset {
  const aois = aoiListSchema.safeParse(row.aois);
  const ai = row.ai_result ? storedAiSchema.safeParse(row.ai_result) : null;
  return {
    row,
    aois: aois.success ? aois.data : [],
    ai: ai?.success
      ? { ...ai.data, provider: row.ai_provider, model: row.ai_model, generatedAt: row.ai_generated_at, engineVersion: row.ai_engine_version }
      : null,
    metrics: (row.metrics ?? null) as StoredMetrics | null,
    result: ai?.success ? ai.data.result : null,
  };
}

export async function loadAssets(supabase: SupabaseClient, studyId: string): Promise<VisualAsset[]> {
  const { data } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("study_id", studyId)
    .order("site_key", { ascending: true, nullsFirst: true })
    .order("task_id", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<VisualAssetRow[]>();
  return (data ?? []).map(toVisualAsset);
}

export type Rendition = "thumb" | "view";

/** Ruta de una versión ligera: "{study}/{uuid}.png" → "{study}/thumb-{uuid}.webp". */
export function renditionPath(storagePath: string, kind: Rendition): string {
  const slash = storagePath.lastIndexOf("/");
  const stem = storagePath.slice(slash + 1).replace(/\.[a-z0-9]+$/i, "");
  return `${storagePath.slice(0, slash)}/${kind}-${stem}.webp`;
}

/**
 * URL firmada por imagen, prefiriendo la versión ligera; si no existe (imágenes subidas
 * antes de que se generaran versiones), usa el original.
 */
export async function assetUrls(supabase: SupabaseClient, paths: string[], kind: Rendition): Promise<Record<string, string>> {
  const urls = await signedUrls(supabase, [...paths.map((p) => renditionPath(p, kind)), ...paths]);
  return Object.fromEntries(paths.flatMap((p) => {
    const u = urls[renditionPath(p, kind)] ?? urls[p];
    return u ? [[p, u]] : [];
  }));
}

/** URLs firmadas (1 h) para mostrar imágenes privadas del bucket. */
export async function signedUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(ASSETS_BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
