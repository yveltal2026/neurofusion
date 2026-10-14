import {
  mean,
  oneSampleTTest,
  sampleSd,
  tTwoSidedP,
} from "@/tools/iat/engine/math";
import { interpretD, type DInterpretation } from "@/tools/iat/engine/dscore";
import {
  computeSurveyAggregates,
  type SurveyAggregates,
  type SurveyAnswers,
  type SurveyConfig,
} from "@/tools/survey/engine";
import { surveyMetrics, type SurveyMetric } from "./metrics";

/**
 * Informe integrado de una batería: junta, por participante, lo que dijo y lo que midió el IAT.
 * Código puro y determinista; la IA (si se usa) sólo redacta sobre estos agregados, nunca sobre filas.
 *
 * Etiquetas de evidencia (ver docs/ROADMAP_MODULOS.md):
 *  - «medido»: lo que el participante hizo (D-score del IAT) o contestó (puntajes de encuesta).
 *  - «estimado»: estadístico inferido de la muestra (correlaciones, intervalos). Depende de n.
 */

export const REPORT_ENGINE_VERSION = "nf-battery-report-1.0";
/** Menos de esto no se calcula una correlación: sería ruido presentado como hallazgo. */
export const MIN_CORRELATION_N = 10;
/** Entre MIN_CORRELATION_N y esto, la correlación se marca como exploratoria. */
export const EXPLORATORY_BELOW_N = 30;

export type Evidence = "medido" | "estimado";

// ------------------------------------------------------------------ entrada

export type ReportStep =
  | {
      kind: "iat";
      studyId: string;
      name: string;
      dimensions: { id: string; name: string }[];
    }
  | { kind: "survey"; studyId: string; name: string; config: SurveyConfig };

export interface ReportParticipant {
  /** id de la sesión de batería. */
  id: string;
  ref: string;
  /** Excluido por el investigador (se muestra pero no entra a ningún cálculo). */
  excluded: boolean;
  /** Por paso IAT: una entrada por dimensión (null si no hay resultado). */
  iat: Record<string, ({ d: number | null; valid: boolean } | null)[]>;
  /** Por paso de encuesta: sus respuestas. */
  survey: Record<string, SurveyAnswers>;
}

// ------------------------------------------------------------------ salida

export interface DimensionReport {
  evidence: "medido";
  stepId: string;
  stepName: string;
  dimensionId: string;
  dimensionName: string;
  /** Participantes con D válido que entran al cálculo. */
  n: number;
  /** Participantes incluidos con resultado inválido o sin resultado (no entran). */
  nInvalid: number;
  mean: number | null;
  sd: number | null;
  ci95: [number, number] | null;
  p: number | null;
  cohenD: number | null;
  interpretation: DInterpretation | null;
}

export interface SurveyStepReport {
  stepId: string;
  stepName: string;
  aggregates: SurveyAggregates;
}

export interface CorrelationReport {
  evidence: "estimado";
  method: "spearman";
  /** Dimensión del IAT. */
  implicit: { stepId: string; dimensionId: string; label: string };
  /** Métrica de encuesta. */
  explicit: { key: string; label: string };
  n: number;
  rho: number;
  ci95: [number, number] | null;
  p: number;
  /** p ajustada por Holm entre TODAS las correlaciones calculadas. */
  pAdjusted: number;
  /** n entre MIN_CORRELATION_N y EXPLORATORY_BELOW_N. */
  exploratory: boolean;
}

export interface ParticipantRow {
  id: string;
  ref: string;
  excluded: boolean;
  /** `${stepId}:${dimensionId}` → D (null si inválido o sin dato). */
  d: Record<string, number | null>;
  /** key de la métrica → valor (null si no contestó). */
  metrics: Record<string, number | null>;
}

export interface BatteryReport {
  engineVersion: string;
  nParticipants: number;
  nExcluded: number;
  nIncluded: number;
  iat: DimensionReport[];
  surveys: SurveyStepReport[];
  metrics: { key: string; label: string; stepId: string }[];
  correlations: CorrelationReport[];
  /** Pares IAT×métrica que no se calcularon por falta de datos, con el motivo. */
  skipped: {
    implicit: string;
    explicit: string;
    n: number;
    reason: "n_insufficient" | "no_variance";
  }[];
  rows: ParticipantRow[];
  notes: string[];
}

// ------------------------------------------------------------------ estadística

/** Rangos medios (los empates reciben el promedio de sus posiciones). */
export function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]!.x === idx[i]!.x) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]!.i] = avg;
    i = j + 1;
  }
  return out;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

export interface RankCorrelation {
  n: number;
  rho: number;
  /** Intervalo de Bonett–Wright (Fisher con la varianza de Spearman). Null si n ≤ 3. */
  ci95: [number, number] | null;
  p: number;
}

/** Correlación de Spearman. Null si hay menos de 3 pares o si alguna variable es constante. */
export function spearman(
  xs: readonly number[],
  ys: readonly number[],
): RankCorrelation | null {
  const n = xs.length;
  if (n !== ys.length || n < 3) return null;
  const rho = pearson(ranks(xs), ranks(ys));
  if (rho === null) return null;
  const p =
    Math.abs(rho) >= 1
      ? 0
      : tTwoSidedP(rho * Math.sqrt((n - 2) / (1 - rho * rho)), n - 2);
  let ci95: [number, number] | null = null;
  if (n > 3 && Math.abs(rho) < 1) {
    const z = Math.atanh(rho);
    const se = Math.sqrt((1 + (rho * rho) / 2) / (n - 3));
    ci95 = [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
  }
  return { n, rho, ci95, p };
}

/** Ajuste de Holm (control de la tasa de error por familia). Conserva el orden de entrada. */
export function holmAdjust(ps: readonly number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const out = new Array<number>(ps.length);
  let running = 0;
  order.forEach((o, rank) => {
    running = Math.max(running, Math.min(1, (ps.length - rank) * o.p));
    out[o.i] = running;
  });
  return out;
}

// ------------------------------------------------------------------ informe

export function buildBatteryReport(
  steps: readonly ReportStep[],
  participants: readonly ReportParticipant[],
): BatteryReport {
  const included = participants.filter((p) => !p.excluded);
  const notes: string[] = [];

  // --- IAT: una fila por dimensión.
  const iat: DimensionReport[] = [];
  for (const step of steps) {
    if (step.kind !== "iat") continue;
    step.dimensions.forEach((dim, idx) => {
      const values: number[] = [];
      let nInvalid = 0;
      for (const p of included) {
        const r = p.iat[step.studyId]?.[idx] ?? null;
        if (r && r.valid && r.d !== null && Number.isFinite(r.d))
          values.push(r.d);
        else nInvalid++;
      }
      // Orden fijo: la suma en coma flotante no debe depender del orden de llegada de los participantes.
      values.sort((a, b) => a - b);
      const test = oneSampleTTest(values);
      const m = values.length ? mean(values) : null;
      iat.push({
        evidence: "medido",
        stepId: step.studyId,
        stepName: step.name,
        dimensionId: dim.id,
        dimensionName: dim.name,
        n: values.length,
        nInvalid,
        mean: m,
        sd: values.length >= 2 ? sampleSd(values) : null,
        ci95: test?.ci95 ?? null,
        p: test?.p ?? null,
        cohenD: test?.cohenD ?? null,
        interpretation: m === null ? null : interpretD(m),
      });
    });
  }

  // --- Encuestas: agregados del motor de encuesta sobre las respuestas de los incluidos.
  const surveys: SurveyStepReport[] = [];
  const metricDefs: SurveyMetric[] = [];
  for (const step of steps) {
    if (step.kind !== "survey") continue;
    const responses = participants
      .filter((p) => p.survey[step.studyId] !== undefined)
      .map((p) => ({
        id: p.id,
        excluded: p.excluded,
        answers: p.survey[step.studyId]!,
      }));
    surveys.push({
      stepId: step.studyId,
      stepName: step.name,
      aggregates: computeSurveyAggregates(step.config, responses),
    });
    metricDefs.push(...surveyMetrics(step.studyId, step.config));
  }

  // --- Filas por participante.
  const rows: ParticipantRow[] = participants.map((p) => {
    const d: ParticipantRow["d"] = {};
    for (const step of steps) {
      if (step.kind !== "iat") continue;
      step.dimensions.forEach((dim, idx) => {
        const r = p.iat[step.studyId]?.[idx] ?? null;
        d[`${step.studyId}:${dim.id}`] =
          r && r.valid && r.d !== null ? r.d : null;
      });
    }
    const metrics: ParticipantRow["metrics"] = {};
    for (const m of metricDefs) {
      const answers = p.survey[m.stepId];
      metrics[m.key] = answers ? m.extract(answers) : null;
    }
    return { id: p.id, ref: p.ref, excluded: p.excluded, d, metrics };
  });
  const includedRows = rows.filter((r) => !r.excluded);

  // --- Correlaciones IAT × métrica (sólo con n suficiente) + Holm sobre las calculadas.
  const raw: Omit<CorrelationReport, "pAdjusted">[] = [];
  const skipped: BatteryReport["skipped"] = [];
  for (const dim of iat) {
    const dKey = `${dim.stepId}:${dim.dimensionId}`;
    for (const m of metricDefs) {
      const pairs: [number, number][] = [];
      for (const r of includedRows) {
        const x = r.d[dKey];
        const y = r.metrics[m.key];
        if (x !== null && x !== undefined && y !== null && y !== undefined)
          pairs.push([x, y]);
      }
      // Orden fijo de los pares (ver arriba): mismo resultado sin importar quién llegó primero.
      pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const xs = pairs.map((q) => q[0]);
      const ys = pairs.map((q) => q[1]);
      const label = `${dim.stepName} · ${dim.dimensionName}`;
      if (xs.length < MIN_CORRELATION_N) {
        skipped.push({
          implicit: label,
          explicit: m.label,
          n: xs.length,
          reason: "n_insufficient",
        });
        continue;
      }
      const c = spearman(xs, ys);
      if (!c) {
        skipped.push({
          implicit: label,
          explicit: m.label,
          n: xs.length,
          reason: "no_variance",
        });
        continue;
      }
      raw.push({
        evidence: "estimado",
        method: "spearman",
        implicit: { stepId: dim.stepId, dimensionId: dim.dimensionId, label },
        explicit: { key: m.key, label: m.label },
        n: c.n,
        rho: c.rho,
        ci95: c.ci95,
        p: c.p,
        exploratory: c.n < EXPLORATORY_BELOW_N,
      });
    }
  }
  const adjusted = holmAdjust(raw.map((c) => c.p));
  const correlations: CorrelationReport[] = raw.map((c, i) => ({
    ...c,
    pAdjusted: adjusted[i]!,
  }));

  // --- Avisos honestos.
  if (included.length < MIN_CORRELATION_N)
    notes.push(
      `Hay ${included.length} participante${included.length === 1 ? "" : "s"} incluido${included.length === 1 ? "" : "s"}: con menos de ${MIN_CORRELATION_N} no se calculan correlaciones.`,
    );
  else if (included.length < EXPLORATORY_BELOW_N)
    notes.push(
      `Con menos de ${EXPLORATORY_BELOW_N} participantes las correlaciones son exploratorias, no concluyentes.`,
    );
  if (correlations.length > 1)
    notes.push(
      `Se calcularon ${correlations.length} correlaciones: usa la p ajustada (Holm), no la p simple, para decidir qué señalar.`,
    );
  if (correlations.length > 0)
    notes.push(
      "Correlación no es causalidad: el IAT mide asociaciones y la encuesta lo que el participante declara.",
    );

  return {
    engineVersion: REPORT_ENGINE_VERSION,
    nParticipants: participants.length,
    nExcluded: participants.length - included.length,
    nIncluded: included.length,
    iat,
    surveys,
    metrics: metricDefs.map((m) => ({
      key: m.key,
      label: m.label,
      stepId: m.stepId,
    })),
    correlations,
    skipped,
    rows,
    notes,
  };
}
