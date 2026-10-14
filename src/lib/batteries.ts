import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatteryRow, BatteryStepRow } from "@/lib/db/types";
import { estimateStudyMinutes } from "@/tools/battery/minutes";
import type { StudyOption } from "@/tools/battery/builder/StepsEditor";
import { batteryConfigSchema, type BatteryConfig, type StepTool } from "@/tools/battery/engine/config";

/** Estudios con participantes de un proyecto (los únicos que pueden ser pasos), con su duración estimada. */
export async function loadStudyOptions(supabase: SupabaseClient, projectId: string): Promise<StudyOption[]> {
  const { data } = await supabase
    .from("studies")
    .select("id, name, tool_type, status, config")
    .eq("project_id", projectId)
    .in("tool_type", ["iat", "survey"])
    .order("created_at", { ascending: false })
    .returns<{ id: string; name: string; tool_type: StepTool; status: StudyOption["status"]; config: unknown }[]>();
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, tool: s.tool_type, status: s.status, minutes: estimateStudyMinutes(s.tool_type, s.config) }));
}

export interface LoadedBattery {
  battery: BatteryRow;
  config: BatteryConfig;
  steps: BatteryStepRow[];
  options: StudyOption[];
  /** Cuántas sesiones de participante tiene (cualquier estado). */
  sessionCount: number;
  projectName: string | null;
}

/** Batería + configuración validada + pasos, respetando RLS. Responde 404 si no existe o no es del usuario. */
export async function loadBatteryForResearcher(supabase: SupabaseClient, id: string): Promise<LoadedBattery> {
  const { data: battery } = await supabase.from("batteries").select("*").eq("id", id).maybeSingle<BatteryRow>();
  if (!battery) notFound();
  const config = batteryConfigSchema.safeParse(battery.config);
  if (!config.success) throw new Error("La configuración guardada de la batería no es válida");

  const { data: steps } = await supabase
    .from("battery_steps")
    .select("battery_id, position, study_id, enabled")
    .eq("battery_id", id)
    .order("position", { ascending: true })
    .returns<BatteryStepRow[]>();
  const { count } = await supabase.from("battery_sessions").select("id", { count: "exact", head: true }).eq("battery_id", id);
  const { data: project } = await supabase.from("projects").select("name").eq("id", battery.project_id).maybeSingle<{ name: string }>();

  return {
    battery,
    config: config.data,
    steps: steps ?? [],
    options: await loadStudyOptions(supabase, battery.project_id),
    sessionCount: count ?? 0,
    projectName: project?.name ?? null,
  };
}
