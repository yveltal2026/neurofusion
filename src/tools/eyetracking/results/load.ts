import type { SupabaseClient } from "@supabase/supabase-js";
import type { EyeTrackingRunRow } from "@/lib/db/types";
import { fetchAll } from "@/lib/studies";
import {
  eyeObservationSchema,
  eyeQualitySchema,
  type EyeObservation,
  type EyeQuality,
} from "@/tools/visual/eye/schema";

export interface EyeReportSession {
  id: string;
  excluded: boolean;
}
export interface EyeReportRun {
  id: string;
  quality: EyeQuality;
  observations: EyeObservation[];
}

/** Categorías excluyentes: las sesiones limitadas o sin lecturas nunca entran en las métricas. */
export function joinEyeReportRuns(
  sessions: readonly EyeReportSession[],
  stored: readonly Pick<
    EyeTrackingRunRow,
    "session_id" | "validation" | "observations"
  >[],
) {
  const bySession = new Map(stored.map((row) => [row.session_id, row]));
  const counts = {
    completed: sessions.length,
    included: 0,
    excluded: 0,
    limited: 0,
    lowQuality: 0,
    invalid: 0,
  };
  const runs: EyeReportRun[] = [];
  for (const session of sessions) {
    if (session.excluded) {
      counts.excluded++;
      continue;
    }
    const row = bySession.get(session.id);
    const quality = eyeQualitySchema.safeParse(row?.validation);
    const observations = eyeObservationSchema
      .array()
      .safeParse(row?.observations);
    if (
      !quality.success ||
      !observations.success ||
      !observations.data.some((o) => o.samples.length)
    ) {
      counts.invalid++;
      continue;
    }
    if (quality.data.measurementStatus === "limited") {
      counts.limited++;
      continue;
    }
    if (!quality.data.passed) {
      counts.lowQuality++;
      continue;
    }
    runs.push({
      id: session.id,
      quality: quality.data,
      observations: observations.data,
    });
    counts.included++;
  }
  return { counts, runs };
}
export type EyeReportRecords = ReturnType<typeof joinEyeReportRuns>;

/** Todas las sesiones completadas, paginadas; no sólo las 100 recientes de la vista de miradas. */
export async function loadEyeReportRecords(
  supabase: SupabaseClient,
  studyId: string,
): Promise<EyeReportRecords> {
  const [sessions, stored] = await Promise.all([
    fetchAll<EyeReportSession>((from, to) =>
      supabase
        .from("sessions")
        .select("id, excluded")
        .eq("study_id", studyId)
        .eq("status", "completed")
        .order("id")
        .range(from, to)
        .returns<EyeReportSession[]>(),
    ),
    fetchAll<
      Pick<EyeTrackingRunRow, "session_id" | "validation" | "observations">
    >(
      (from, to) =>
        supabase
          .from("eye_tracking_runs")
          .select("session_id, validation, observations")
          .eq("study_id", studyId)
          .order("session_id")
          .range(from, to),
      50,
    ),
  ]);
  return joinEyeReportRuns(sessions, stored);
}
