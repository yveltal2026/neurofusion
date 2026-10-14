import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import type { SurveyResponse } from "../engine";

/** Una respuesta de encuesta con los datos de su sesión (para tablas y CSV). */
export interface SurveyRecord extends SurveyResponse {
  participantRef: string;
  deviceType: string;
  startedAt: string;
  completedAt: string | null;
  excludedReason: string | null;
}

export interface SurveySessionRow {
  id: string;
  participant_ref: string;
  status: string;
  excluded: boolean;
  excluded_reason: string | null;
  device_type: string;
  started_at: string;
  completed_at: string | null;
}

export interface SurveyAnswerRow {
  session_id: string;
  answers: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Une sesiones y respuestas. Sólo cuentan las sesiones COMPLETADAS que tienen respuestas
 * guardadas; las abandonadas o a medias no entran. Ordena de la más reciente a la más antigua.
 */
export function joinSurveyRecords(
  sessions: readonly SurveySessionRow[],
  answers: readonly SurveyAnswerRow[],
): SurveyRecord[] {
  const byId = new Map(answers.map((a) => [a.session_id, a.answers]));
  const out: SurveyRecord[] = [];
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const stored = byId.get(s.id);
    if (!isRecord(stored)) continue;
    out.push({
      id: s.id,
      excluded: s.excluded,
      excludedReason: s.excluded_reason,
      answers: stored,
      participantRef: s.participant_ref,
      deviceType: s.device_type,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    });
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const SESSION_COLUMNS =
  "id, participant_ref, status, excluded, excluded_reason, device_type, started_at, completed_at";

/** Respuestas completadas del estudio, respetando RLS (usa la sesión del investigador). */
export async function loadSurveyRecords(
  supabase: SupabaseClient,
  studyId: string,
): Promise<SurveyRecord[]> {
  const [sessions, answers] = await Promise.all([
    fetchAll<SurveySessionRow>((from, to) =>
      supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("study_id", studyId)
        .eq("status", "completed")
        .order("id")
        .range(from, to)
        .returns<SurveySessionRow[]>(),
    ),
    fetchAll<SurveyAnswerRow>((from, to) =>
      supabase
        .from("survey_answers")
        .select("session_id, answers")
        .eq("study_id", studyId)
        .order("session_id")
        .range(from, to)
        .returns<SurveyAnswerRow[]>(),
    ),
  ]);
  return joinSurveyRecords(sessions, answers);
}
