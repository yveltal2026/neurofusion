import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import { iatConfigSchema } from "@/tools/iat/config";
import { surveyConfigSchema } from "@/tools/survey/engine";
import { chunk, loadBatteryDetail, type BatteryDetail } from "../load";
import type { ReportParticipant, ReportStep } from "./report";

/** Filas mínimas tal como salen de Supabase. */
export interface BatterySessionLite {
  id: string;
  participant_ref: string;
  excluded: boolean;
}
export interface ChildSessionLite {
  id: string;
  battery_session_id: string;
  study_id: string;
  excluded: boolean;
}
export interface ResultLite {
  session_id: string;
  dimension_idx: number;
  d_score: number | null;
  valid: boolean;
}
export interface AnswersLite {
  session_id: string;
  answers: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Une por participante lo que midió el IAT y lo que contestó en la encuesta. Un participante queda
 * excluido si el investigador lo excluyó a nivel batería O en cualquiera de sus pasos. Los pasos sin
 * datos quedan vacíos (null / ausentes): el motor del informe sabe qué hacer con eso.
 */
export function assembleParticipants(
  steps: readonly ReportStep[],
  batterySessions: readonly BatterySessionLite[],
  children: readonly ChildSessionLite[],
  results: readonly ResultLite[],
  answers: readonly AnswersLite[],
): ReportParticipant[] {
  const resultsBySession = new Map<string, ResultLite[]>();
  for (const r of results) {
    const list = resultsBySession.get(r.session_id) ?? [];
    list.push(r);
    resultsBySession.set(r.session_id, list);
  }
  const answersBySession = new Map(
    answers.map((a) => [a.session_id, a.answers]),
  );

  return batterySessions.map((bs) => {
    const mine = children.filter((c) => c.battery_session_id === bs.id);
    const participant: ReportParticipant = {
      id: bs.id,
      ref: bs.participant_ref,
      excluded: bs.excluded || mine.some((c) => c.excluded),
      iat: {},
      survey: {},
    };
    for (const step of steps) {
      const child = mine.find((c) => c.study_id === step.studyId);
      if (!child) continue;
      if (step.kind === "iat") {
        const rows = resultsBySession.get(child.id) ?? [];
        participant.iat[step.studyId] = step.dimensions.map((_, idx) => {
          const row = rows.find((r) => r.dimension_idx === idx);
          return row ? { d: row.d_score, valid: row.valid } : null;
        });
      } else {
        const stored = answersBySession.get(child.id);
        if (isRecord(stored)) participant.survey[step.studyId] = stored;
      }
    }
    return participant;
  });
}

/** Pasos activos de la batería con su configuración, para el motor del informe. */
export async function loadReportSteps(
  supabase: SupabaseClient,
  detail: BatteryDetail,
): Promise<{ steps: ReportStep[]; unreadable: string[] }> {
  const active = detail.steps.filter((s) => s.enabled);
  const { data } = await supabase
    .from("studies")
    .select("id, config")
    .in(
      "id",
      active.map((s) => s.studyId),
    );
  const configs = new Map((data ?? []).map((r) => [r.id as string, r.config]));

  const steps: ReportStep[] = [];
  const unreadable: string[] = [];
  for (const s of active) {
    const raw = configs.get(s.studyId);
    if (s.toolType === "iat") {
      const c = iatConfigSchema.safeParse(raw);
      if (!c.success) unreadable.push(s.name);
      else
        steps.push({
          kind: "iat",
          studyId: s.studyId,
          name: s.name,
          conceptA: c.data.conceptA.label,
          conceptB: c.data.conceptB.label,
          dimensions: c.data.dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            positiveLabel: d.positiveLabel,
          })),
        });
    } else {
      const c = surveyConfigSchema.safeParse(raw);
      if (!c.success) unreadable.push(s.name);
      else
        steps.push({
          kind: "survey",
          studyId: s.studyId,
          name: s.name,
          config: c.data,
        });
    }
  }
  return { steps, unreadable };
}

export interface BatteryReportInput {
  detail: BatteryDetail;
  steps: ReportStep[];
  unreadable: string[];
  participants: ReportParticipant[];
}

/**
 * Carga todo lo que necesita el informe integrado, respetando RLS (usa la sesión del investigador).
 * Sólo cuentan las sesiones de batería COMPLETADAS y los pasos completados.
 */
export async function loadBatteryReportInput(
  supabase: SupabaseClient,
  batteryId: string,
): Promise<BatteryReportInput | null> {
  const detail = await loadBatteryDetail(supabase, batteryId);
  if (!detail) return null;
  const { steps, unreadable } = await loadReportSteps(supabase, detail);

  const completed: BatterySessionLite[] = detail.sessions
    .filter((s) => s.status === "completed")
    .map((s) => ({
      id: s.id,
      participant_ref: s.participantRef,
      excluded: s.excluded,
    }));

  const children: ChildSessionLite[] = [];
  for (const ids of chunk(
    completed.map((s) => s.id),
    100,
  )) {
    const rows = await fetchAll<{
      id: string;
      battery_session_id: string;
      study_id: string;
      excluded: boolean;
    }>((from, to) =>
      supabase
        .from("sessions")
        .select("id, battery_session_id, study_id, excluded")
        .in("battery_session_id", ids)
        .eq("status", "completed")
        .order("id")
        .range(from, to),
    );
    children.push(...rows);
  }

  const stepKind = new Map(steps.map((s) => [s.studyId, s.kind]));
  const iatChildIds = children
    .filter((c) => stepKind.get(c.study_id) === "iat")
    .map((c) => c.id);
  const surveyChildIds = children
    .filter((c) => stepKind.get(c.study_id) === "survey")
    .map((c) => c.id);

  const results: ResultLite[] = [];
  for (const ids of chunk(iatChildIds, 100)) {
    results.push(
      ...(await fetchAll<ResultLite>((from, to) =>
        supabase
          .from("session_results")
          .select("session_id, dimension_idx, d_score, valid")
          .in("session_id", ids)
          .order("session_id")
          .order("dimension_idx")
          .range(from, to),
      )),
    );
  }
  const answers: AnswersLite[] = [];
  for (const ids of chunk(surveyChildIds, 100)) {
    answers.push(
      ...(await fetchAll<AnswersLite>((from, to) =>
        supabase
          .from("survey_answers")
          .select("session_id, answers")
          .in("session_id", ids)
          .order("session_id")
          .range(from, to),
      )),
    );
  }

  return {
    detail,
    steps,
    unreadable,
    participants: assembleParticipants(
      steps,
      completed,
      children,
      results,
      answers,
    ),
  };
}
