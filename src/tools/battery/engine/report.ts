/**
 * Informe integrado de una batería: une, por sesión de batería, las medidas implícitas (D del IAT) y
 * explícitas (puntuaciones de instrumentos) y calcula agregados y correlaciones con su n, intervalo y
 * advertencias. Código puro, versionado y con pruebas. La IA, si interviene, sólo redacta sobre estos
 * agregados: nunca recibe filas por participante.
 *
 * Reglas de privacidad: no se devuelven valores individuales, y no se reporta ninguna cifra con menos de
 * MIN_REPORT_N participantes (en un salón chico, un valor «agregado» identifica a alguien).
 */
import { mean, sampleSd, tQuantile, tTwoSidedP } from "../../iat/engine/math";

export const REPORT_ENGINE_VERSION = "nf-battery-report-1.0";

/** Por debajo de esto no se reporta ninguna cifra agregada. */
export const MIN_REPORT_N = 5;
/** Por debajo de esto las correlaciones son muy inestables y se advierte. */
export const SMALL_N = 30;

export type Evidence = "medido" | "estimado" | "modelado";
export type Family = "implicit" | "explicit";

export interface MeasureDef {
  /** Identificador estable, p. ej. `iat:<studyId>` o `survey:<studyId>:sus`. */
  key: string;
  label: string;
  family: Family;
  /** De dónde viene la cifra. Todo lo que hoy entra a una batería es medido con participantes reales. */
  evidence: Evidence;
}

export interface BatteryParticipant {
  id: string;
  /** Excluida manualmente por el investigador. */
  excluded: boolean;
  completed: boolean;
  /** Valor de cada medida; null/ausente si el participante no la tiene. */
  values: Record<string, number | null | undefined>;
}

export interface MeasureSummary {
  key: string;
  label: string;
  family: Family;
  evidence: Evidence;
  n: number;
  /** Null si n < MIN_REPORT_N (se suprime). */
  mean: number | null;
  sd: number | null;
  ci95: [number, number] | null;
  suppressed: boolean;
}

export interface CorrelationResult {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  n: number;
  /** Null si se suprime o no hay variación. */
  r: number | null;
  ci95: [number, number] | null;
  p: number | null;
  /** Texto de por qué no hay cifra, si no la hay. */
  reason: string | null;
  smallSample: boolean;
}

export interface BatteryReport {
  engineVersion: string;
  funnel: { total: number; completed: number; excluded: number; included: number };
  measures: MeasureSummary[];
  /** Correlaciones entre una medida implícita y una explícita. */
  correlations: CorrelationResult[];
  warnings: string[];
}

/** r de Pearson entre dos series de igual longitud. Null si n < 3 o alguna no varía. */
export function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** p de dos colas de r contra 0 (t con n − 2 grados de libertad). */
export function correlationP(r: number, n: number): number {
  if (n < 3) return 1;
  if (Math.abs(r) >= 1) return 0;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  return tTwoSidedP(t, n - 2);
}

/** IC95 % de r por la transformación z de Fisher. Requiere n > 3. */
export function correlationCi(r: number, n: number): [number, number] | null {
  if (n <= 3) return null;
  if (Math.abs(r) >= 1) return [r, r];
  const z = Math.atanh(r);
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.959964 * se), Math.tanh(z + 1.959964 * se)];
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function buildBatteryReport(measures: readonly MeasureDef[], participants: readonly BatteryParticipant[]): BatteryReport {
  const warnings: string[] = [];
  const excluded = participants.filter((p) => p.excluded).length;
  const included = participants.filter((p) => !p.excluded && p.completed);
  const funnel = {
    total: participants.length,
    completed: participants.filter((p) => p.completed).length,
    excluded,
    included: included.length,
  };

  if (included.length === 0) warnings.push("Aún no hay sesiones completas de la batería.");
  else if (included.length < MIN_REPORT_N)
    warnings.push(`Hay ${included.length} sesiones completas: con menos de ${MIN_REPORT_N} no se reporta ninguna cifra, para no identificar a nadie.`);
  else if (included.length < SMALL_N)
    warnings.push(`Muestra pequeña (${included.length} sesiones completas): los intervalos son amplios y las correlaciones inestables. Úsalo como exploración, no como conclusión.`);

  const summaries: MeasureSummary[] = measures.map((m) => {
    const xs = included.map((p) => p.values[m.key]).filter(finite);
    const n = xs.length;
    const base = { key: m.key, label: m.label, family: m.family, evidence: m.evidence, n };
    if (n < MIN_REPORT_N) return { ...base, mean: null, sd: null, ci95: null, suppressed: true };
    const mu = mean(xs);
    const sd = sampleSd(xs);
    const half = tQuantile(0.975, n - 1) * (sd / Math.sqrt(n));
    return { ...base, mean: mu, sd, ci95: [mu - half, mu + half] as [number, number], suppressed: false };
  });

  const correlations: CorrelationResult[] = [];
  const implicit = measures.filter((m) => m.family === "implicit");
  const explicit = measures.filter((m) => m.family === "explicit");
  for (const a of implicit) {
    for (const b of explicit) {
      const pairs = included.map((p) => [p.values[a.key], p.values[b.key]] as const).filter((v): v is readonly [number, number] => finite(v[0]) && finite(v[1]));
      const n = pairs.length;
      const base = { a: a.key, b: b.key, aLabel: a.label, bLabel: b.label, n, smallSample: n < SMALL_N };
      if (n < MIN_REPORT_N) {
        correlations.push({ ...base, r: null, ci95: null, p: null, reason: `Sólo ${n} participante(s) con ambas medidas; se necesitan al menos ${MIN_REPORT_N}.` });
        continue;
      }
      const r = pearson(
        pairs.map((v) => v[0]),
        pairs.map((v) => v[1]),
      );
      if (r === null) {
        correlations.push({ ...base, r: null, ci95: null, p: null, reason: "Una de las medidas no varía entre participantes." });
        continue;
      }
      correlations.push({ ...base, r, ci95: correlationCi(r, n), p: correlationP(r, n), reason: null });
    }
  }
  if (correlations.length > 1 && included.length >= MIN_REPORT_N)
    warnings.push(`Se calcularon ${correlations.length} correlaciones sin corrección por comparaciones múltiples: una «significativa» entre varias puede ser azar.`);
  warnings.push("Correlación no implica causa. Los valores son autorreporte (explícito) y tiempos de reacción (implícito) de la misma sesión.");

  return { engineVersion: REPORT_ENGINE_VERSION, funnel, measures: summaries, correlations, warnings };
}
