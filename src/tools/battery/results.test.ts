import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { DEFAULT_THANK_YOU, defaultConsentText } from "@/tools/survey/engine";
import { buildBatteryReport } from "./engine/report";
import { reportMeasures, toParticipants } from "./measures";
import { loadBatteryReportData } from "./results";

type Row = Record<string, unknown>;

/** Cliente falso en memoria con select/eq/in/order/range (lo que usa el cargador). */
function fake(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let order: { col: string; asc: boolean } | null = null;
      const run = () => {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) rows = [...rows].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: rows.map((r) => ({ ...r })), error: null };
      };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
        order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), api),
        range: (a: number, b: number) => ((range = [a, b]), api),
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return api;
    },
  } as unknown as SupabaseClient;
}

const survey = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [{ kind: "instrument", id: "sus", instrumentId: "sus", required: true }],
};

function tables(n: number): Record<string, Row[]> {
  const t: Record<string, Row[]> = {
    battery_steps: [
      { battery_id: "bat", position: 0, study_id: "i1", enabled: true },
      { battery_id: "bat", position: 1, study_id: "s1", enabled: true },
      { battery_id: "bat", position: 2, study_id: "off", enabled: false },
    ],
    studies: [
      { id: "i1", tool_type: "iat", name: "IAT", config: demoConfig() },
      { id: "s1", tool_type: "survey", name: "Encuesta", config: survey },
      { id: "off", tool_type: "survey", name: "Omitida", config: survey },
    ],
    battery_sessions: [],
    sessions: [],
    session_results: [],
    survey_answers: [],
  };
  for (let i = 0; i < n; i++) {
    const bs = `bs${String(i).padStart(3, "0")}`;
    t.battery_sessions!.push({ id: bs, battery_id: "bat", status: "completed", excluded: false, started_at: `2026-10-15T10:${String(i % 60).padStart(2, "0")}` });
    t.sessions!.push({ id: `ci-${i}`, study_id: "i1", battery_session_id: bs, status: "completed" }, { id: `cs-${i}`, study_id: "s1", battery_session_id: bs, status: "completed" });
    t.session_results!.push({ session_id: `ci-${i}`, dimension_idx: 0, d_score: 0.02 * i, valid: true });
    t.survey_answers!.push({ session_id: `cs-${i}`, scores: [{ blockId: "sus", instrumentId: "sus", score: { instrument: "sus", score: 40 + i } }] });
  }
  return t;
}

describe("loadBatteryReportData", () => {
  it("une las sesiones hijas con sus resultados y arma las medidas del informe", async () => {
    const data = await loadBatteryReportData(fake(tables(20)), "bat");
    expect(data.steps.map((s) => s.studyId)).toEqual(["i1", "s1"]); // el paso omitido no cuenta
    expect(data.sessions).toHaveLength(20);
    const report = buildBatteryReport(reportMeasures(data.steps), toParticipants(data.sessions));
    expect(report.funnel).toMatchObject({ total: 20, completed: 20, included: 20 });
    const c = report.correlations[0]!;
    expect(c.n).toBe(20);
    expect(c.r!).toBeCloseTo(1, 10);
  });

  it("maneja más sesiones que el tamaño de un lote de consulta", async () => {
    const data = await loadBatteryReportData(fake(tables(400)), "bat");
    expect(data.sessions).toHaveLength(400);
    expect(data.sessions.every((s) => s.iat.length === 1 && s.survey.length === 1)).toBe(true);
  });

  it("ignora sesiones hijas incompletas y las no ligadas a la batería", async () => {
    const t = tables(6);
    (t.sessions![0] as Row).status = "started";
    t.sessions!.push({ id: "suelta", study_id: "s1", battery_session_id: null, status: "completed" });
    const data = await loadBatteryReportData(fake(t), "bat");
    expect(data.sessions[0]!.iat).toEqual([]);
    expect(data.sessions.reduce((n, s) => n + s.survey.length, 0)).toBe(6);
  });

  it("una batería sin pasos ni sesiones devuelve vacío", async () => {
    const data = await loadBatteryReportData(fake({ battery_steps: [], studies: [], battery_sessions: [], sessions: [] }), "bat");
    expect(data).toEqual({ steps: [], sessions: [] });
  });
});
