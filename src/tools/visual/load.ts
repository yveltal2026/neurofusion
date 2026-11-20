import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyRow } from "@/lib/db/types";
import { webVisualConfigSchema } from "@/tools/web-visual/config";
import { visualConfigSchema, type VisualConfig } from "./config";

/** Estudio visual (o web_visual) + configuración validada + nombre del proyecto (404 si no aplica). */
export async function loadVisualStudyPage(supabase: SupabaseClient, id: string, mode?: VisualConfig["mode"], allowEyeTracking = false) {
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).maybeSingle<StudyRow>();
  if (!study || (study.tool_type !== "visual" && study.tool_type !== "web_visual")) notFound();
  let config: VisualConfig;
  if (study.tool_type === "web_visual") {
    const webParsed = webVisualConfigSchema.safeParse(study.config);
    if (!webParsed.success) throw new Error("La configuración guardada del estudio no es válida");
    config = {
      mode: "pieces",
      objective: webParsed.data.objective,
      brand: webParsed.data.brand,
      audience: webParsed.data.audience,
    };
  } else {
    const parsed = visualConfigSchema.safeParse(study.config);
    if (!parsed.success) throw new Error("La configuración guardada del estudio no es válida");
    config = parsed.data;
  }
  if (!allowEyeTracking && config.mode === "pieces" && config.eyeTracking) notFound();
  if (mode && config.mode !== mode) notFound();
  const { data: project } = await supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle();
  return { study, config, projectName: (project?.name as string | undefined) ?? null };
}
