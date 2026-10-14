/**
 * Motor de pruebas de estímulos (A/B, primer clic, preferencia): asignación reproducible,
 * comparación de proporciones y de medias, y agregación de clics. Código puro y con pruebas.
 *
 * ESTADO: sólo el motor. Todavía no hay runner (5 segundos, primer clic, A/B), API ni pantallas
 * del investigador; ver docs/ROADMAP_MODULOS.md, módulo 4. Las pruebas A/B con pocos participantes
 * detectan sólo diferencias grandes: usa la calculadora de muestra antes de interpretarlas.
 */
import { mulberry32, shuffle } from "../iat/engine/rng";
import { mean, sampleSd, tQuantile, tTwoSidedP } from "../iat/engine/math";

export const STIMULI_ENGINE_VERSION = "nf-stimuli-0.1";

// ---------------------------------------------------------------- asignación

/**
 * Variante que toca al participante número `index` (0, 1, 2…): aleatorización por bloques permutados.
 * Cada bloque contiene cada variante el mismo número de veces, así que el reparto nunca se desbalancea
 * más de lo que cabe en un bloque. Es función pura de (index, variantes, semilla): reproducible y sin estado.
 */
export function assignVariant<T>(index: number, variants: readonly T[], seed: number, replicates = 2): T {
  if (variants.length === 0) throw new RangeError("Se necesita al menos una variante");
  if (!Number.isInteger(index) || index < 0) throw new RangeError("index debe ser un entero ≥ 0");
  const size = variants.length * replicates;
  const block = Math.floor(index / size);
  const bag: T[] = [];
  for (let r = 0; r < replicates; r++) bag.push(...variants);
  // Una semilla distinta por bloque, derivada de la semilla del estudio.
  const order = shuffle(bag, mulberry32((seed + Math.imul(block + 1, 0x9e3779b1)) >>> 0));
  return order[index % size]!;
}

// ---------------------------------------------------------------- proporciones

/** Intervalo de Wilson al 95 %. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface ProportionComparison {
  p1: number;
  p2: number;
  /** p1 − p2. */
  diff: number;
  /** IC95 % de la diferencia (método híbrido de Newcombe, basado en intervalos de Wilson). */
  ci95: [number, number];
  /** p de dos colas de la prueba z de dos proporciones (error estándar agrupado). */
  p: number;
  /** h de Cohen (diferencia de proporciones transformadas con arcoseno). */
  cohenH: number;
}

/** Compara dos proporciones independientes (p. ej. % que hace clic en el botón correcto en A frente a B). */
export function compareProportions(k1: number, n1: number, k2: number, n2: number): ProportionComparison | null {
  if (n1 < 1 || n2 < 1 || k1 < 0 || k2 < 0 || k1 > n1 || k2 > n2) return null;
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const [l1, u1] = wilson(k1, n1);
  const [l2, u2] = wilson(k2, n2);
  const diff = p1 - p2;
  const ci95: [number, number] = [diff - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), diff + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  // Con 0 o 1 en la tasa agrupada no hay variación: no hay prueba que hacer.
  const p = se > 0 ? tTwoSidedP(diff / se, 1e7) : 1;
  const h = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
  return { p1, p2, diff, ci95, p, cohenH: h };
}

// ---------------------------------------------------------------- medias

export interface MeanComparison {
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  /** mean1 − mean2. */
  diff: number;
  /** IC95 % de la diferencia (t de Welch). */
  ci95: [number, number];
  t: number;
  /** Grados de libertad de Welch–Satterthwaite. */
  df: number;
  p: number;
  /** d de Cohen con DE agrupada. */
  cohenD: number;
  /** g de Hedges: d con corrección por muestra pequeña. */
  hedgesG: number;
}

/** t de Welch para dos grupos independientes (calificaciones, tiempos, etc.). Null si algún grupo tiene n < 2 o no hay variación. */
export function compareMeans(a: readonly number[], b: readonly number[]): MeanComparison | null {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = sampleSd(a) ** 2;
  const v2 = sampleSd(b) ** 2;
  const se2 = v1 / n1 + v2 / n2;
  if (!(se2 > 0)) return null;
  const se = Math.sqrt(se2);
  const diff = m1 - m2;
  const t = diff / se;
  const df = se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const crit = tQuantile(0.975, df);
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const cohenD = pooledSd > 0 ? diff / pooledSd : 0;
  const hedgesG = cohenD * (1 - 3 / (4 * (n1 + n2) - 9));
  return { n1, n2, mean1: m1, mean2: m2, diff, ci95: [diff - crit * se, diff + crit * se], t, df, p: tTwoSidedP(t, df), cohenD, hedgesG };
}

// ---------------------------------------------------------------- clics

/** Clic en coordenadas normalizadas (0–1) sobre la pieza, con origen arriba a la izquierda. */
export interface Click {
  x: number;
  y: number;
}

/** Área de interés rectangular en coordenadas normalizadas. */
export interface Aoi {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inUnit = (c: Click) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1;

/** Cuenta de clics por celda de una rejilla `cols × rows`. Descarta clics fuera de la pieza. */
export function clickGrid(clicks: readonly Click[], cols: number, rows: number): { counts: number[][]; total: number; discarded: number } {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) throw new RangeError("La rejilla debe tener al menos 1 × 1");
  const counts = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  let total = 0;
  let discarded = 0;
  for (const c of clicks) {
    if (!inUnit(c)) {
      discarded++;
      continue;
    }
    const col = Math.min(cols - 1, Math.floor(c.x * cols));
    const row = Math.min(rows - 1, Math.floor(c.y * rows));
    counts[row]![col]!++;
    total++;
  }
  return { counts, total, discarded };
}

export const inAoi = (c: Click, a: Aoi) => c.x >= a.x && c.x <= a.x + a.w && c.y >= a.y && c.y <= a.y + a.h;

/** Éxito del primer clic: proporción de clics dentro del área objetivo, con su intervalo de Wilson. */
export function firstClickSuccess(clicks: readonly Click[], target: Aoi): { n: number; hits: number; rate: number | null; ci95: [number, number] | null } {
  const valid = clicks.filter(inUnit);
  const hits = valid.filter((c) => inAoi(c, target)).length;
  if (valid.length === 0) return { n: 0, hits: 0, rate: null, ci95: null };
  return { n: valid.length, hits, rate: hits / valid.length, ci95: wilson(hits, valid.length) };
}
