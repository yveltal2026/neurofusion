import { STRENGTH_LABEL } from "../results/labels";
import { interpretD } from "../engine/dscore";
import type { DimensionAggregate, StudyAggregates } from "../engine/stats";

/** Series para las gráficas, calculadas del dato real (nunca generadas por la IA). */

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export interface MeanDRow {
  label: string;
  mean: number;
  low: number;
  high: number;
  /** [mean − low, high − mean], formato de ErrorBar de Recharts. */
  error: [number, number];
  n: number;
  strength: string;
}

/** D medio por dimensión (más el compuesto) con IC95 %. Omite dimensiones sin estimación. */
export function meanDChart(agg: StudyAggregates): MeanDRow[] {
  return [...agg.dimensions, agg.overall].flatMap((d) => {
    if (!d.test) return [];
    const [low, high] = d.test.ci95;
    return [
      {
        label: d.label,
        mean: r3(d.test.mean),
        low: r3(low),
        high: r3(high),
        error: [r3(d.test.mean - low), r3(high - d.test.mean)] as [number, number],
        n: d.n,
        strength: STRENGTH_LABEL[interpretD(d.test.mean).strength],
      },
    ];
  });
}

export interface HistogramRow {
  range: string;
  from: number;
  count: number;
}

export function histogramChart(dim: DimensionAggregate): HistogramRow[] {
  return dim.histogram.map((b) => ({ range: `${b.from.toFixed(2)} a ${b.to.toFixed(2)}`, from: b.from, count: b.count }));
}

export interface DirectionRow {
  label: string;
  /** % de participantes cuya asociación favorece al Concepto A / sin preferencia / al B. */
  A: number;
  none: number;
  B: number;
  n: number;
}

export function directionChart(agg: StudyAggregates): DirectionRow[] {
  return [...agg.dimensions, agg.overall]
    .filter((d) => d.n > 0)
    .map((d) => ({
      label: d.label,
      A: pct(d.directionCounts.A, d.n),
      none: pct(d.directionCounts.none, d.n),
      B: pct(d.directionCounts.B, d.n),
      n: d.n,
    }));
}

export interface ConcordanceRow {
  label: string;
  consistent: number;
  partial: number;
  dissonant: number;
  n: number;
}

export function concordanceChart(agg: StudyAggregates): ConcordanceRow[] {
  return [...agg.dimensions, agg.overall]
    .filter((d) => d.concordance.n > 0)
    .map((d) => ({
      label: d.label,
      consistent: pct(d.concordance.consistent, d.concordance.n),
      partial: pct(d.concordance.partial, d.concordance.n),
      dissonant: pct(d.concordance.dissonant, d.concordance.n),
      n: d.concordance.n,
    }));
}
