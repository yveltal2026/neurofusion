import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import type { VariantScores } from "../score";

/** Un resultado de variante con los datos de su sesión (para tablas, gráficas y CSV). */
export interface VariantRecord {
  id: string;
  participantRef: string;
  deviceType: string;
  startedAt: string;
  completedAt: string | null;
  /** Excluida a mano por el investigador. */
  excluded: boolean;
  excludedReason: string | null;
  scores: VariantScores;
  primary: number | null;
  /** false ⇒ la puntuación trae advertencias de calidad. */
  valid: boolean;
  flags: string[];
}

export interface VariantSessionRow {
  id: string;
  participant_ref: string;
  status: string;
  excluded: boolean;
  excluded_reason: string | null;
  device_type: string;
  started_at: string;
  completed_at: string | null;
}

export interface VariantResultRow {
  session_id: string;
  scores: unknown;
  primary_value: number | null;
  valid: boolean;
  flags: string[] | null;
}

const isScores = (v: unknown): v is VariantScores =>
  typeof v === "object" && v !== null && "variant" in v && "detail" in v && "flags" in v;

/**
 * Une sesiones y resultados. Sólo cuentan las sesiones COMPLETADAS con resultado guardado;
 * las abandonadas o a medias no entran. Ordena de la más reciente a la más antigua.
 */
export function joinVariantRecords(sessions: readonly VariantSessionRow[], results: readonly VariantResultRow[]): VariantRecord[] {
  const byId = new Map(results.map((r) => [r.session_id, r]));
  const out: VariantRecord[] = [];
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const r = byId.get(s.id);
    if (!r || !isScores(r.scores)) continue;
    out.push({
      id: s.id,
      participantRef: s.participant_ref,
      deviceType: s.device_type,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      excluded: s.excluded,
      excludedReason: s.excluded_reason,
      scores: r.scores,
      primary: r.primary_value,
      valid: r.valid,
      flags: r.flags ?? [],
    });
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const SESSION_COLUMNS = "id, participant_ref, status, excluded, excluded_reason, device_type, started_at, completed_at";

/** Resultados completados del estudio, respetando RLS (usa la sesión del investigador). */
export async function loadVariantRecords(supabase: SupabaseClient, studyId: string): Promise<VariantRecord[]> {
  const [sessions, results] = await Promise.all([
    fetchAll<VariantSessionRow>((from, to) =>
      supabase.from("sessions").select(SESSION_COLUMNS).eq("study_id", studyId).eq("status", "completed").order("id").range(from, to).returns<VariantSessionRow[]>(),
    ),
    fetchAll<VariantResultRow>((from, to) =>
      supabase.from("variant_results").select("session_id, scores, primary_value, valid, flags").eq("study_id", studyId).order("session_id").range(from, to).returns<VariantResultRow[]>(),
    ),
  ]);
  return joinVariantRecords(sessions, results);
}
