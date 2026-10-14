import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyRow } from "@/lib/db/types";
import { visualConfigSchema, type VisualConfig } from "./config";

/** Estudio visual + configuración validada + nombre del proyecto (404 si no aplica). */
export async function loadVisualStudyPage(supabase: SupabaseClient, id: string, mode?: VisualConfig["mode"]) {
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).eq("tool_type", "visual").maybeSingle<StudyRow>();
  if (!study) notFound();
  const parsed = visualConfigSchema.safeParse(study.config);
  if (!parsed.success) throw new Error("La configuración guardada del estudio no es válida");
  if (mode && parsed.data.mode !== mode) notFound();
  const { data: project } = await supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle();
  return { study, config: parsed.data, projectName: (project?.name as string | undefined) ?? null };
}
