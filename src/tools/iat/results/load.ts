import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import type { IatConfig } from "../config";
import { buildSessionViews, type ResultRow, type SessionRow, type SessionView, type TrialExportRow } from "./views";

const SESSION_COLUMNS =
  "id, participant_ref, status, demographics, explicit_preference, input_mode, device_type, screen_width, screen_height, duplicate_flag, excluded, excluded_reason, started_at, completed_at";
const RESULT_COLUMNS =
  "session_id, dimension_idx, first_combo, d_score, strength, direction, error_rate, fast_fraction, n_used, n_trials, valid, flags";

/** Todas las sesiones del estudio con sus resultados por dimensión (la más reciente primero). */
export async function loadSessionViews(supabase: SupabaseClient, studyId: string, config: IatConfig): Promise<SessionView[]> {
  const [sessions, results] = await Promise.all([
    fetchAll<SessionRow>((from, to) =>
      supabase.from("sessions").select(SESSION_COLUMNS).eq("study_id", studyId).order("started_at", { ascending: false }).order("id").range(from, to).returns<SessionRow[]>(),
    ),
    fetchAll<ResultRow>((from, to) =>
      supabase.from("session_results").select(RESULT_COLUMNS).eq("study_id", studyId).order("session_id").order("dimension_idx").range(from, to).returns<ResultRow[]>(),
    ),
  ]);
  return buildSessionViews(config, sessions, results);
}

export async function loadTrialsForExport(supabase: SupabaseClient, studyId: string): Promise<TrialExportRow[]> {
  return fetchAll<TrialExportRow>((from, to) =>
    supabase
      .from("trials")
      .select("session_id, dimension_idx, block, trial_idx, category, stimulus, correct_side, pressed_side, rt_ms, error")
      .eq("study_id", studyId)
      .order("id")
      .range(from, to)
      .returns<TrialExportRow[]>(),
  );
}
