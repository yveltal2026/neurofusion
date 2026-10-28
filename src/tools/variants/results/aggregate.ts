import { oneSampleTTest, type OneSampleTest } from "@/tools/iat/engine/math";
import type { VariantConfig } from "../config";
import type { VariantRecord } from "./load";

/**
 * Agregados de un estudio de variante. Regla de calidad: el resultado principal promedia sólo a los
 * participantes SIN advertencias y no excluidos a mano; los demás se cuentan y se explican (nunca se
 * promedian en silencio ni se esconden). `primaryAll` muestra cómo cambiaría el promedio si se incluyeran.
 */

export type Unit = "d" | "d_prime" | "ms";

export const UNIT_LABEL: Record<Unit, string> = { d: "D", d_prime: "d′", ms: "ms" };

export interface Estimate {
  label: string;
  /** Prueba t de una muestra contra 0; null si hay menos de 2 participantes o ninguna variación. */
  test: OneSampleTest | null;
  n: number;
  mean: number | null;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  label: string;
}

export interface VariantAggregates {
  variant: VariantConfig["variant"];
  unit: Unit;
  nCompleted: number;
  nManuallyExcluded: number;
  /** Con advertencias de calidad (y no excluidos a mano). */
  nFlagged: number;
  /** Los que entran al promedio principal. */
  nIncluded: number;
  flagCounts: { flag: string; count: number }[];
  primary: Estimate;
  /** Sensibilidad: incluye también a los marcados (sólo los que tienen valor calculado). */
  primaryAll: Estimate;
  /** Por concepto (GNAT y priming con dos conceptos). */
  secondary: Estimate[];
  /** Cifras descriptivas de los incluidos (tiempos medios, d′ por celda...). */
  descriptive: { label: string; value: string }[];
  histogram: HistogramBin[];
  devices: { deviceType: string; count: number }[];
}

const finite = (xs: (number | null | undefined)[]): number[] => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function estimate(label: string, values: (number | null | undefined)[]): Estimate {
  const xs = finite(values);
  return { label, test: oneSampleTTest(xs), n: xs.length, mean: meanOf(xs) };
}

const BIN_WIDTH: Record<Unit, number> = { d: 0.25, d_prime: 0.5, ms: 20 };

export function histogram(values: number[], unit: Unit): HistogramBin[] {
  if (values.length === 0) return [];
  const w = BIN_WIDTH[unit];
  const lo = Math.floor(Math.min(...values) / w);
  const hi = Math.floor(Math.max(...values) / w);
  const digits = unit === "ms" ? 0 : 2;
  const bins: HistogramBin[] = [];
  for (let i = lo; i <= hi; i++) {
    const from = +(i * w).toFixed(4);
    const to = +((i + 1) * w).toFixed(4);
    bins.push({ from, to, count: 0, label: `${from.toFixed(digits)} a ${to.toFixed(digits)}` });
  }
  for (const v of values) bins[Math.floor(v / w) - lo].count++;
  return bins;
}

export function unitOf(variant: VariantConfig["variant"]): Unit {
  return variant === "sc_iat" ? "d" : variant === "gnat" ? "d_prime" : "ms";
}

const f = (n: number | null, d = 0) => (n === null ? "sin dato" : n.toFixed(d));

export function computeVariantAggregates(config: VariantConfig, records: readonly VariantRecord[]): VariantAggregates {
  const unit = unitOf(config.variant);
  const active = records.filter((r) => !r.excluded);
  const included = active.filter((r) => r.valid && r.primary !== null);
  const flagged = active.filter((r) => !r.valid);

  const flagTotals = new Map<string, number>();
  for (const r of flagged) for (const flag of r.flags) flagTotals.set(flag, (flagTotals.get(flag) ?? 0) + 1);

  const secondary: Estimate[] = [];
  const descriptive: VariantAggregates["descriptive"] = [];

  if (config.variant === "sc_iat") {
    const details = included.flatMap((r) => (r.scores.detail.kind === "sc_iat" ? [r.scores.detail.result] : []));
    descriptive.push(
      { label: `Tiempo medio con «${config.attribute.positiveLabel}»`, value: `${f(meanOf(finite(details.map((d) => d.meanTargetPositive))))} ms` },
      { label: `Tiempo medio con «${config.attribute.negativeLabel}»`, value: `${f(meanOf(finite(details.map((d) => d.meanTargetNegative))))} ms` },
      { label: "Errores y tiempos agotados", value: `${f((meanOf(finite(details.map((d) => d.errorRate))) ?? 0) * 100, 1)} %` },
    );
  } else if (config.variant === "gnat") {
    const details = included.flatMap((r) => (r.scores.detail.kind === "gnat" ? [r.scores.detail] : []));
    if (config.concepts.length === 2) {
      config.concepts.forEach((c, i) => secondary.push(estimate(`${c.label}: d′(${config.attribute.positiveLabel}) − d′(${config.attribute.negativeLabel})`, details.map((d) => d.contrasts[i]))));
    }
    config.concepts.forEach((c, ci) => {
      for (const pole of ["positive", "negative"] as const) {
        const vals = details.map((d) => d.blocks.find((b) => b.conceptIdx === ci && b.pole === pole)?.result.dPrime);
        const label = pole === "positive" ? config.attribute.positiveLabel : config.attribute.negativeLabel;
        descriptive.push({ label: `d′ medio · ${c.label} + ${label}`, value: f(meanOf(finite(vals)), 2) });
      }
    });
  } else {
    const details = included.flatMap((r) => (r.scores.detail.kind === "priming" ? [r.scores.detail] : []));
    if (config.concepts.length === 2) {
      config.concepts.forEach((c, i) => secondary.push(estimate(`${c.label} frente al control`, details.map((d) => d.effects[i]))));
    }
    descriptive.push({ label: "Errores", value: `${f((meanOf(finite(details.map((d) => d.errorRate))) ?? 0) * 100, 1)} %` });
  }

  const deviceCounts = new Map<string, number>();
  for (const r of records) deviceCounts.set(r.deviceType, (deviceCounts.get(r.deviceType) ?? 0) + 1);

  return {
    variant: config.variant,
    unit,
    nCompleted: records.length,
    nManuallyExcluded: records.length - active.length,
    nFlagged: flagged.length,
    nIncluded: included.length,
    flagCounts: [...flagTotals].map(([flag, count]) => ({ flag, count })).sort((a, b) => b.count - a.count),
    primary: estimate("Medida principal", included.map((r) => r.primary)),
    primaryAll: estimate("Incluyendo a los marcados", active.map((r) => r.primary)),
    secondary,
    descriptive,
    histogram: histogram(finite(included.map((r) => r.primary)), unit),
    devices: [...deviceCounts].map(([deviceType, count]) => ({ deviceType, count })).sort((a, b) => b.count - a.count),
  };
}

export const FLAG_LABEL: Record<string, string> = {
  high_error_rate: "Muchos errores (más del 30 % de los ensayos)",
  fast_responses: "Respuestas demasiado rápidas (posibles anticipaciones)",
  insufficient_data: "Datos insuficientes para calcular",
  low_discrimination: "Casi no distingue señal de ruido (d′ global bajo)",
};
