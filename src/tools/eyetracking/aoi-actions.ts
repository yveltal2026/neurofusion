"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { aoiListSchema } from "@/tools/visual/engine/aoi";
import { eyeStudyConfigSchema } from "./config";

const inputSchema = z.object({
  studyId: z.string().uuid(),
  assetId: z.string().uuid(),
  aois: aoiListSchema.refine(
    (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
    "Los identificadores deben ser únicos",
  ),
});

export async function saveEyeAois(
  raw: unknown,
): Promise<{ error?: string; ok?: boolean }> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Áreas inválidas" };
  const { supabase, user } = await requireUser();
  const { studyId, assetId, aois } = parsed.data;
  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("config")
    .eq("id", studyId)
    .eq("tool_type", "visual")
    .maybeSingle();
  if (studyError || !eyeStudyConfigSchema.safeParse(study?.config).success)
    return { error: "No se encontró el estudio de eye tracking." };
  const { data, error } = await supabase
    .from("visual_assets")
    .update({
      aois,
      aois_source: "analyst",
      aois_reviewed_at: new Date().toISOString(),
      aois_reviewed_by: user.id,
    })
    .eq("study_id", studyId)
    .eq("id", assetId)
    .select("id");
  if (error || !data?.length)
    return { error: "No se pudieron guardar las áreas de interés." };
  revalidatePath(`/studies/${studyId}/eye`);
  revalidatePath(`/studies/${studyId}/assets/${assetId}`);
  return { ok: true };
}
