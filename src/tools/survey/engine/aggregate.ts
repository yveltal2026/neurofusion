import { mean, sampleSd, tQuantile } from "@/tools/iat/engine/math";
import { getInstrument, type InstrumentId } from "./instruments";
import {
  analyzeGaborGranger,
  analyzeVanWestendorp,
  GG_YES,
  VW_QUESTIONS,
  type GgResult,
  type PriceMethod,
  type VwResult,
} from "./price";
import {
  listItems,
  priceItemId,
  SURVEY_ENGINE_VERSION,
  type SurveyAnswers,
  type SurveyConfig,
} from "./schema";
import {
  cronbachAlpha,
  directionalValues,
  npsCategory,
  readInstrumentValues,
  scoreInstrument,
  SUS_BENCHMARK,
} from "./scoring";

/**
 * Agregados deterministas de una encuesta. Es el ÚNICO insumo numérico que se
 * entrega a la IA: nunca respuestas individuales, textos libres ni datos
 * personales. Proporciones en 0–1; el NPS, en puntos (−100 a 100).
 */

export interface SurveyResponse {
  id: string;
  /** Excluida manualmente por el investigador. */
  excluded?: boolean;
  answers: SurveyAnswers;
  /** Variables categóricas ya discretizadas (p. ej. rango de edad). */
  segments?: Record<string, string>;
}

export interface AggregateOptions {
  /** Grupos con menos respuestas se suprimen de los desgloses. Default 5. */
  minGroupSize?: number;
}

export const DEFAULT_MIN_GROUP_SIZE = 5;

export interface NumericSummary {
  n: number;
  mean: number;
  /** Null si n < 2. */
  sd: number | null;
  min: number;
  max: number;
  /** IC95 % de la media (t de Student). Null si n < 2. */
  ci95: [number, number] | null;
}

export function summarizeNumeric(xs: readonly number[]): NumericSummary | null {
  const n = xs.length;
  if (n === 0) return null;
  const m = mean(xs);
  if (n < 2)
    return { n, mean: m, sd: null, min: xs[0]!, max: xs[0]!, ci95: null };
  const sd = sampleSd(xs);
  const half = tQuantile(0.975, n - 1) * (sd / Math.sqrt(n));
  return {
    n,
    mean: m,
    sd,
    min: Math.min(...xs),
    max: Math.max(...xs),
    ci95: [m - half, m + half],
  };
}

/** Intervalo de Wilson al 95 % para una proporción. Null si n = 0. */
export function wilsonInterval(
  successes: number,
  n: number,
): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + z ** 2 / n;
  const center = (p + z ** 2 / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export interface NpsSummary {
  n: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** %promotores − %detractores, en puntos (−100 a 100). */
  nps: number;
  /** Aproximación normal; poco fiable con muestras chicas. */
  ci95: [number, number];
}

export function summarizeNps(values: readonly number[]): NpsSummary | null {
  const n = values.length;
  if (n === 0) return null;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const v of values) {
    const c = npsCategory(v);
    if (c === "promoter") promoters++;
    else if (c === "passive") passives++;
    else detractors++;
  }
  const pP = promoters / n;
  const pD = detractors / n;
  const nps = (pP - pD) * 100;
  const se = Math.sqrt((pP + pD - (pP - pD) ** 2) / n) * 100;
  return {
    n,
    promoters,
    passives,
    detractors,
    nps,
    ci95: [Math.max(-100, nps - 1.96 * se), Math.min(100, nps + 1.96 * se)],
  };
}

function distribution(values: readonly number[], min: number, max: number) {
  const out: { value: number; count: number }[] = [];
  for (let v = min; v <= max; v++)
    out.push({ value: v, count: values.filter((x) => x === v).length });
  return out;
}

export type ItemAggregate =
  | { id: string; label: string; type: "text"; n: number }
  | {
      id: string;
      label: string;
      type: "number";
      n: number;
      summary: NumericSummary | null;
    }
  | {
      id: string;
      label: string;
      type: "scale";
      n: number;
      summary: NumericSummary | null;
      distribution: { value: number; count: number }[];
    }
  | {
      id: string;
      label: string;
      type: "select" | "multiselect";
      n: number;
      options: { option: string; count: number; pct: number }[];
    };

export type InstrumentAggregate =
  | {
      blockId: string;
      instrument: "sus";
      n: number;
      summary: NumericSummary | null;
      benchmark: number;
      alpha: number | null;
    }
  | {
      blockId: string;
      instrument: "nps";
      n: number;
      summary: NpsSummary | null;
    }
  | {
      blockId: string;
      instrument: "sam";
      n: number;
      valence: NumericSummary | null;
      arousal: NumericSummary | null;
      dominance: NumericSummary | null;
    }
  | {
      blockId: string;
      instrument: "purchase_intent";
      n: number;
      summary: NumericSummary | null;
      distribution: { value: number; count: number }[];
      topTwoBox: { count: number; pct: number; ci95: [number, number] } | null;
    }
  | {
      blockId: string;
      instrument: "attitude";
      n: number;
      summary: NumericSummary | null;
      alpha: number | null;
    };

/** Resultado de un bloque de precio. Intención declarada: no es un pronóstico de ventas. */
export type PriceAggregate =
  | { blockId: string; method: Extract<PriceMethod, "van_westendorp">; currency: string; result: VwResult }
  | { blockId: string; method: Extract<PriceMethod, "gabor_granger">; currency: string; result: GgResult };

export interface SurveyAggregates {
  engineVersion: string;
  /** Respuestas recibidas (incluye las excluidas). */
  nTotal: number;
  /** Respuestas que entran al análisis. */
  nIncluded: number;
  items: ItemAggregate[];
  instruments: InstrumentAggregate[];
  prices: PriceAggregate[];
}

function numbersOf(responses: readonly SurveyResponse[], id: string): number[] {
  const out: number[] = [];
  for (const r of responses) {
    const v = r.answers[id];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function computeSurveyAggregates(
  config: SurveyConfig,
  responses: readonly SurveyResponse[],
): SurveyAggregates {
  const included = responses.filter((r) => !r.excluded);

  const priceBlockIds = new Set(config.blocks.filter((b) => b.kind === "price").map((b) => b.id));

  const items: ItemAggregate[] = listItems(config)
    // Los ítems de instrumentos y de precio se reportan por bloque, no uno a uno.
    .filter((it) => !(it.type === "scale" && it.instrument) && !priceBlockIds.has(it.blockId))
    .map((it): ItemAggregate => {
      const common = { id: it.id, label: it.label };
      switch (it.type) {
        case "text":
          return {
            ...common,
            type: "text",
            n: included.filter(
              (r) =>
                typeof r.answers[it.id] === "string" &&
                (r.answers[it.id] as string).trim() !== "",
            ).length,
          };
        case "number": {
          const xs = numbersOf(included, it.id);
          return {
            ...common,
            type: "number",
            n: xs.length,
            summary: summarizeNumeric(xs),
          };
        }
        case "scale": {
          const xs = numbersOf(included, it.id);
          return {
            ...common,
            type: "scale",
            n: xs.length,
            summary: summarizeNumeric(xs),
            distribution: distribution(xs, it.min, it.max),
          };
        }
        case "select":
        case "multiselect": {
          const answered = included.filter(
            (r) => r.answers[it.id] !== undefined && r.answers[it.id] !== null,
          );
          const n = answered.length;
          const options = it.options.map((option) => {
            const count = answered.filter((r) => {
              const v = r.answers[it.id];
              return Array.isArray(v) ? v.includes(option) : v === option;
            }).length;
            return { option, count, pct: n === 0 ? 0 : count / n };
          });
          return { ...common, type: it.type, n, options };
        }
      }
    });

  const instruments: InstrumentAggregate[] = [];
  for (const b of config.blocks) {
    if (b.kind !== "instrument") continue;
    instruments.push(aggregateInstrument(b.instrumentId, b.id, included));
  }

  const prices: PriceAggregate[] = [];
  for (const b of config.blocks) {
    if (b.kind !== "price") continue;
    const currency = b.currency ?? "MXN";
    if (b.method === "van_westendorp") {
      const rows = included
        .map((r) => VW_QUESTIONS.map((_, i) => r.answers[priceItemId(b.id, i + 1)]))
        .filter((v): v is number[] => v.every((x) => typeof x === "number" && Number.isFinite(x)))
        .map(([tooCheap, cheap, expensive, tooExpensive]) => ({ tooCheap: tooCheap!, cheap: cheap!, expensive: expensive!, tooExpensive: tooExpensive! }));
      prices.push({ blockId: b.id, method: "van_westendorp", currency, result: analyzeVanWestendorp(rows) });
    } else {
      const list = b.prices ?? [];
      const rows = included
        .map((r) => list.map((_, i) => r.answers[priceItemId(b.id, i + 1)]))
        .filter((v) => v.every((x) => typeof x === "string"))
        .map((v) => ({ buys: v.map((x) => x === GG_YES) }));
      prices.push({ blockId: b.id, method: "gabor_granger", currency, result: analyzeGaborGranger(list, rows) });
    }
  }

  return {
    engineVersion: SURVEY_ENGINE_VERSION,
    nTotal: responses.length,
    nIncluded: included.length,
    items,
    instruments,
    prices,
  };
}

function aggregateInstrument(
  instrumentId: InstrumentId,
  blockId: string,
  responses: readonly SurveyResponse[],
): InstrumentAggregate {
  const rows = responses
    .map((r) => readInstrumentValues(instrumentId, blockId, r.answers))
    .filter((v): v is number[] => v !== null);
  const n = rows.length;
  const inst = getInstrument(instrumentId);
  const column = (j: number) => rows.map((r) => r[j]!);

  switch (instrumentId) {
    case "sus": {
      const scores = rows.map((r) => {
        const s = scoreInstrument("sus", r);
        return s?.instrument === "sus" ? s.score : NaN;
      });
      return {
        blockId,
        instrument: "sus",
        n,
        summary: summarizeNumeric(scores),
        benchmark: SUS_BENCHMARK,
        alpha: cronbachAlpha(rows.map((r) => directionalValues("sus", r))),
      };
    }
    case "nps":
      return {
        blockId,
        instrument: "nps",
        n,
        summary: summarizeNps(column(0)),
      };
    case "sam":
      return {
        blockId,
        instrument: "sam",
        n,
        valence: summarizeNumeric(column(0)),
        arousal: summarizeNumeric(column(1)),
        dominance: summarizeNumeric(column(2)),
      };
    case "purchase_intent": {
      const values = column(0);
      const top = values.filter((v) => v >= 4).length;
      const ci = wilsonInterval(top, n);
      return {
        blockId,
        instrument: "purchase_intent",
        n,
        summary: summarizeNumeric(values),
        distribution: distribution(values, inst.scale.min, inst.scale.max),
        topTwoBox: ci ? { count: top, pct: top / n, ci95: ci } : null,
      };
    }
    case "attitude":
      return {
        blockId,
        instrument: "attitude",
        n,
        summary: summarizeNumeric(rows.map((r) => mean(r))),
        alpha: cronbachAlpha(rows),
      };
  }
}

export interface GroupSplit {
  groups: { value: string; responses: SurveyResponse[] }[];
  /** Cuántos grupos se omitieron por tener menos de `minGroupSize` respuestas. */
  suppressedGroups: number;
  /** Respuestas sin valor en esa variable. */
  unclassified: number;
}

/**
 * Divide las respuestas por una variable categórica y suprime los grupos
 * chicos. Protege contra la reidentificación en muestras pequeñas (p. ej. un
 * salón de clase) tanto en pantalla como en lo que se entrega a la IA.
 */
export function splitByGroup(
  responses: readonly SurveyResponse[],
  segmentKey: string,
  minGroupSize = DEFAULT_MIN_GROUP_SIZE,
): GroupSplit {
  const byValue = new Map<string, SurveyResponse[]>();
  let unclassified = 0;
  for (const r of responses) {
    if (r.excluded) continue;
    const v = r.segments?.[segmentKey];
    if (v === undefined) {
      unclassified++;
      continue;
    }
    const list = byValue.get(v) ?? [];
    list.push(r);
    byValue.set(v, list);
  }
  const groups: GroupSplit["groups"] = [];
  let suppressedGroups = 0;
  for (const [value, list] of [...byValue.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "es"),
  )) {
    if (list.length < minGroupSize) suppressedGroups++;
    else groups.push({ value, responses: list });
  }
  return { groups, suppressedGroups, unclassified };
}
