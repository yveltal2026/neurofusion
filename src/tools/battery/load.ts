import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import type { BatteryRow, BatterySessionRow } from "@/lib/db/types";
import {
  batteryConfigSchema,
  isBatteryTool,
  type BatteryConfig,
  type BatteryStep,
  type SummaryChild,
  type SummarySession,
} from "./engine";
import type { AvailableStudy } from "./ui/StepsEditor";

/** Parte una lista en trozos (las consultas con `in(...)` no admiten listas enormes). */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Estudios del proyecto que se pueden usar como paso (IAT y encuesta). */
export async function loadAvailableStudies(
  supabase: SupabaseClient,
  projectId: string,
): Promise<AvailableStudy[]> {
  const { data } = await supabase
    .from("studies")
    .select("id, name, tool_type")
    .eq("project_id", projectId)
    .in("tool_type", ["iat", "survey"])
    .order("created_at", { ascending: true });
  return (data ?? []).flatMap((s) =>
    isBatteryTool(s.tool_type)
      ? [
          {
            studyId: s.id as string,
            toolType: s.tool_type,
            name: s.name as string,
          },
        ]
      : [],
  );
}

export interface BatteryDetail {
  battery: BatteryRow;
  config: BatteryConfig | null;
  steps: BatteryStep[];
  sessions: SummarySession[];
  children: SummaryChild[];
}

interface StepJoinRow {
  study_id: string;
  position: number;
  enabled: boolean;
  studies:
    | { name: string; tool_type: string }
    | { name: string; tool_type: string }[]
    | null;
}

/** Batería con sus pasos y sus participantes, respetando RLS (usa la sesión del investigador). */
export async function loadBatteryDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<BatteryDetail | null> {
  const { data: battery } = await supabase
    .from("batteries")
    .select("*")
    .eq("id", id)
    .maybeSingle<BatteryRow>();
  if (!battery) return null;

  const [stepRows, sessionRows] = await Promise.all([
    supabase
      .from("battery_steps")
      .select("study_id, position, enabled, studies(name, tool_type)")
      .eq("battery_id", id)
      .order("position")
      .returns<StepJoinRow[]>(),
    fetchAll<BatterySessionRow>((from, to) =>
      supabase
        .from("battery_sessions")
        .select(
          "id, battery_id, participant_ref, status, run_order, device_type, excluded, excluded_reason, started_at, completed_at",
        )
        .eq("battery_id", id)
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to)
        .returns<BatterySessionRow[]>(),
    ),
  ]);

  const steps: BatteryStep[] = (stepRows.data ?? []).flatMap((r) => {
    const study = Array.isArray(r.studies) ? r.studies[0] : r.studies;
    if (!study || !isBatteryTool(study.tool_type)) return [];
    return [
      {
        studyId: r.study_id,
        toolType: study.tool_type,
        name: study.name,
        enabled: r.enabled,
      },
    ];
  });

  const children: SummaryChild[] = [];
  for (const ids of chunk(
    sessionRows.map((s) => s.id),
    100,
  )) {
    const { data } = await supabase
      .from("sessions")
      .select("battery_session_id, study_id, status")
      .in("battery_session_id", ids);
    for (const c of data ?? []) {
      children.push({
        batterySessionId: c.battery_session_id as string,
        studyId: c.study_id as string,
        status: c.status as string,
      });
    }
  }

  const config = batteryConfigSchema.safeParse(battery.config);
  return {
    battery,
    config: config.success ? config.data : null,
    steps,
    sessions: sessionRows.map((s) => ({
      id: s.id,
      participantRef: s.participant_ref,
      status: s.status,
      runOrder: Array.isArray(s.run_order) ? s.run_order : [],
      deviceType: s.device_type,
      excluded: s.excluded,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    })),
    children,
  };
}
