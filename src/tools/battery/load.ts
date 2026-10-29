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
import { refreshParticipationActivity } from "@/lib/participation-activity-server";

/** Parte una lista en trozos (las consultas con `in(...)` no admiten listas enormes). */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Cuántas imágenes tiene cada estudio de imagen (las que un paso de exposición mostraría). */
export async function pieceCounts(
  supabase: SupabaseClient,
  studyIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(studyIds.map((id) => [id, 0]));
  for (const ids of chunk(studyIds, 100)) {
    const { data } = await supabase
      .from("visual_assets")
      .select("study_id")
      .in("study_id", ids);
    for (const r of data ?? [])
      counts.set(
        r.study_id as string,
        (counts.get(r.study_id as string) ?? 0) + 1,
      );
  }
  return counts;
}

/**
 * Estudios del proyecto que se pueden usar como paso: IAT, variantes del IAT, encuestas y análisis de
 * imagen con IA en modo piezas (el journey es un panel modelado: no hay nada que mostrarle a una persona).
 */
export async function loadAvailableStudies(
  supabase: SupabaseClient,
  projectId: string,
): Promise<AvailableStudy[]> {
  const { data } = await supabase
    .from("studies")
    .select("id, name, tool_type, mode:config->>mode, eyeTracking:config->eyeTracking")
    .eq("project_id", projectId)
    .in("tool_type", ["iat", "iat_variant", "survey", "visual"])
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as {
    id: string;
    name: string;
    tool_type: string;
    mode: string | null;
    eyeTracking?: unknown;
  }[];
  const usable = rows.filter(
    (s) =>
      isBatteryTool(s.tool_type) &&
      (s.tool_type !== "visual" || (s.mode === "pieces" && !s.eyeTracking)),
  );
  const pieces = await pieceCounts(
    supabase,
    usable.filter((s) => s.tool_type === "visual").map((s) => s.id),
  );
  return usable.flatMap((s) =>
    isBatteryTool(s.tool_type)
      ? [
          {
            studyId: s.id,
            toolType: s.tool_type,
            name: s.name,
            ...(s.tool_type === "visual"
              ? { pieces: pieces.get(s.id) ?? 0 }
              : {}),
          },
        ]
      : [],
  );
}

/**
 * Nombres de los pasos de exposición ACTIVOS que no tienen imágenes: un paso así dejaría a los
 * participantes sin nada que ver, así que no se guarda la batería hasta que el estudio tenga piezas.
 */
export async function exposureStepsWithoutPieces(
  supabase: SupabaseClient,
  steps: readonly { studyId: string; enabled: boolean }[],
): Promise<string[]> {
  const ids = steps.filter((s) => s.enabled).map((s) => s.studyId);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("studies")
    .select("id, name")
    .in("id", ids)
    .eq("tool_type", "visual");
  const visual = (data ?? []) as { id: string; name: string }[];
  if (visual.length === 0) return [];
  const counts = await pieceCounts(
    supabase,
    visual.map((v) => v.id),
  );
  return visual.filter((v) => !counts.get(v.id)).map((v) => v.name);
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
  await refreshParticipationActivity(supabase, "battery", id);

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
          "id, battery_id, participant_ref, status, run_order, device_type, excluded, excluded_reason, started_at, completed_at, last_activity_at, inactive_since, abandon_reason",
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
      lastActivityAt: s.last_activity_at,
      inactiveSince: s.inactive_since,
      abandonReason: s.abandon_reason,
    })),
    children,
  };
}
