import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import { iatConfigSchema } from "@/tools/iat/config";
import { surveyConfigSchema, type BlockScore } from "@/tools/survey/engine";
import type { BatterySessionData, IatSessionData, ReportStep, SurveySessionData } from "./measures";

/** Datos de una batería para el informe integrado, leídos con el cliente del investigador (RLS). */
export interface BatteryReportData {
  steps: ReportStep[];
  sessions: BatterySessionData[];
}

/** Máximo de ids por consulta `in (...)`: evita URLs enormes en PostgREST. */
const CHUNK = 150;

function chunks<T>(xs: readonly T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const isScoreArray = (v: unknown): v is BlockScore[] =>
  Array.isArray(v) && v.every((b) => typeof b === "object" && b !== null && "blockId" in b && "instrumentId" in b && "score" in b);

export async function loadBatteryReportData(supabase: SupabaseClient, batteryId: string): Promise<BatteryReportData> {
  const { data: stepRows } = await supabase
    .from("battery_steps")
    .select("position, study_id, enabled")
    .eq("battery_id", batteryId)
    .order("position", { ascending: true });
  const activeIds = ((stepRows ?? []) as { study_id: string; enabled: boolean }[]).filter((s) => s.enabled).map((s) => s.study_id);

  const { data: studyRows } = activeIds.length
    ? await supabase.from("studies").select("id, tool_type, name, config").in("id", activeIds)
    : { data: [] };
  const byId = new Map(((studyRows ?? []) as { id: string; tool_type: string; name: string; config: unknown }[]).map((s) => [s.id, s]));

  const steps: ReportStep[] = [];
  for (const id of activeIds) {
    const s = byId.get(id);
    if (!s) continue;
    if (s.tool_type === "iat") {
      const c = iatConfigSchema.safeParse(s.config);
      if (c.success) steps.push({ studyId: id, name: s.name, tool: "iat", dimensionNames: c.data.dimensions.map((d) => d.name) });
    } else if (s.tool_type === "survey") {
      const c = surveyConfigSchema.safeParse(s.config);
      if (c.success) steps.push({ studyId: id, name: s.name, tool: "survey", config: c.data });
    }
  }
  const toolOf = new Map(steps.map((s) => [s.studyId, s.tool]));

  const batterySessions = await fetchAll<{ id: string; status: string; excluded: boolean }>((from, to) =>
    supabase.from("battery_sessions").select("id, status, excluded").eq("battery_id", batteryId).order("started_at", { ascending: true }).range(from, to),
  );
  const ids = batterySessions.map((s) => s.id);

  const children: { id: string; study_id: string; battery_session_id: string; status: string }[] = [];
  for (const part of chunks(ids)) {
    children.push(
      ...(await fetchAll<{ id: string; study_id: string; battery_session_id: string; status: string }>((from, to) =>
        supabase.from("sessions").select("id, study_id, battery_session_id, status").in("battery_session_id", part).eq("status", "completed").range(from, to),
      )),
    );
  }
  const childIds = children.map((c) => c.id);

  const results = new Map<string, { dimension_idx: number; d_score: number | null; valid: boolean }[]>();
  const scores = new Map<string, BlockScore[]>();
  for (const part of chunks(childIds)) {
    const rows = await fetchAll<{ session_id: string; dimension_idx: number; d_score: number | null; valid: boolean }>((from, to) =>
      supabase.from("session_results").select("session_id, dimension_idx, d_score, valid").in("session_id", part).range(from, to),
    );
    for (const r of rows) results.set(r.session_id, [...(results.get(r.session_id) ?? []), r]);
    const answers = await fetchAll<{ session_id: string; scores: unknown }>((from, to) =>
      supabase.from("survey_answers").select("session_id, scores").in("session_id", part).range(from, to),
    );
    for (const a of answers) if (isScoreArray(a.scores)) scores.set(a.session_id, a.scores);
  }

  const childrenOf = new Map<string, typeof children>();
  for (const c of children) childrenOf.set(c.battery_session_id, [...(childrenOf.get(c.battery_session_id) ?? []), c]);

  const sessions: BatterySessionData[] = batterySessions.map((bs) => {
    const iat: IatSessionData[] = [];
    const survey: SurveySessionData[] = [];
    for (const c of childrenOf.get(bs.id) ?? []) {
      const tool = toolOf.get(c.study_id);
      if (tool === "iat") {
        const dims = [...(results.get(c.id) ?? [])].sort((a, b) => a.dimension_idx - b.dimension_idx);
        iat.push({ studyId: c.study_id, dimensions: dims.map((d) => ({ d: d.d_score, valid: d.valid })) });
      } else if (tool === "survey") {
        const sc = scores.get(c.id);
        if (sc) survey.push({ studyId: c.study_id, scores: sc });
      }
    }
    return { id: bs.id, excluded: bs.excluded, completed: bs.status === "completed", iat, survey };
  });

  return { steps, sessions };
}
