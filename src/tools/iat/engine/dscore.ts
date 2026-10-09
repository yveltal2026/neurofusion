import { D_FIRST_BLOCKS, D_SECOND_BLOCKS } from "./protocol";
import { mean, sampleSd } from "./math";
import type { FirstCombo, TrialRecord } from "./types";

/** Ensayos con RT mayor a este valor se excluyen del cálculo. */
export const MAX_RT_MS = 10_000;
/** Respuestas más rápidas que esto se consideran sospechosas (no se excluyen, se reportan). */
export const FAST_RT_MS = 300;
/** Si más de este % de ensayos válidos son < FAST_RT_MS, la calidad es insuficiente. */
export const MAX_FAST_FRACTION = 0.1;

export type PreferenceStrength = "none" | "slight" | "moderate" | "strong";
/** "A": asociación implícita favorece al Concepto A; "B": favorece al B. */
export type PreferenceDirection = "A" | "B" | "none";

export interface DInterpretation {
  strength: PreferenceStrength;
  direction: PreferenceDirection;
}

/**
 * |D| < 0.15 sin preferencia clara · 0.15–0.35 leve · 0.35–0.65 moderada ·
 * > 0.65 fuerte. En las fronteras compartidas, 0.15 pasa a "leve", 0.35 se
 * queda en "leve" y 0.65 en "moderada".
 */
export function interpretD(d: number): DInterpretation {
  const abs = Math.abs(d);
  const strength: PreferenceStrength =
    abs < 0.15 ? "none" : abs <= 0.35 ? "slight" : abs <= 0.65 ? "moderate" : "strong";
  const direction: PreferenceDirection =
    strength === "none" ? "none" : d > 0 ? "A" : "B";
  return { strength, direction };
}

export interface DScoreResult {
  /**
   * D normalizado: D > 0 ⇒ el Concepto A se asocia más al polo POSITIVO que el
   * B, sin importar el orden aleatorio de esa sesión. null si no se puede calcular.
   */
  d: number | null;
  /** D sin normalizar el signo: (M(6+7) − M(3+4)) / SD. */
  rawD: number | null;
  firstCombo: FirstCombo;
  meanFirst: number | null;
  meanSecond: number | null;
  pooledSd: number | null;
  nFirst: number;
  nSecond: number;
  /** Ensayos usados en el cálculo (RT ≤ 10 000 ms, bloques 3, 4, 6, 7). */
  nUsed: number;
  nExcludedSlow: number;
  /** Fracción de los ensayos usados con RT < 300 ms. */
  fastFraction: number;
  /** true si fastFraction > 10 %. */
  qualityInsufficient: boolean;
  interpretation: DInterpretation | null;
}

/**
 * D-score (algoritmo mejorado, Greenwald, Nosek & Banaji, 2003) tal como lo
 * especifica la skill iat-study-builder:
 *
 *  1. Usa los bloques 3+4 y 6+7 (práctica + prueba de cada combinación).
 *  2. Excluye ensayos con RT > 10 000 ms.
 *  3. Marca calidad insuficiente si > 10 % de los ensayos válidos tienen RT < 300 ms.
 *  4. D = (M(6+7) − M(3+4)) / SD de TODOS los ensayos válidos de ambos
 *     conjuntos juntos (SD muestral, n − 1).
 *  5. El signo se normaliza con `firstCombo`: si en 3-4 el Concepto A compartió
 *     tecla con el polo negativo, se invierte el signo.
 *
 * Los ensayos con error se incluyen con su RT (que ya contiene el tiempo de
 * corrección), sin penalización adicional.
 */
export function computeDScore(
  trials: readonly TrialRecord[],
  firstCombo: FirstCombo,
): DScoreResult {
  const inFirst = trials.filter((t) => D_FIRST_BLOCKS.includes(t.block));
  const inSecond = trials.filter((t) => D_SECOND_BLOCKS.includes(t.block));
  const isValid = (t: TrialRecord) => Number.isFinite(t.rtMs) && t.rtMs <= MAX_RT_MS;

  const first = inFirst.filter(isValid).map((t) => t.rtMs);
  const second = inSecond.filter(isValid).map((t) => t.rtMs);
  const nExcludedSlow = inFirst.length + inSecond.length - first.length - second.length;
  const all = [...first, ...second];

  const nUsed = all.length;
  const fastCount = all.filter((rt) => rt < FAST_RT_MS).length;
  const fastFraction = nUsed > 0 ? fastCount / nUsed : 0;
  const qualityInsufficient = fastFraction > MAX_FAST_FRACTION;

  const base = {
    firstCombo,
    nFirst: first.length,
    nSecond: second.length,
    nUsed,
    nExcludedSlow,
    fastFraction,
    qualityInsufficient,
  };

  const pooledSd = sampleSd(all);
  if (first.length === 0 || second.length === 0 || !(pooledSd > 0)) {
    return {
      ...base,
      d: null,
      rawD: null,
      meanFirst: first.length ? mean(first) : null,
      meanSecond: second.length ? mean(second) : null,
      pooledSd: Number.isFinite(pooledSd) ? pooledSd : null,
      interpretation: null,
    };
  }

  const meanFirst = mean(first);
  const meanSecond = mean(second);
  const rawD = (meanSecond - meanFirst) / pooledSd;
  const d = firstCombo === "A_with_P1" ? rawD : -rawD;

  return {
    ...base,
    d,
    rawD,
    meanFirst,
    meanSecond,
    pooledSd,
    interpretation: interpretD(d),
  };
}
