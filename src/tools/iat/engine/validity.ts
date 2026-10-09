import type { DScoreResult } from "./dscore";
import { MAX_FAST_FRACTION } from "./dscore";
import type { TrialRecord } from "./types";

/** Tasa de error global por dimensión a partir de la cual se advierte. */
export const MAX_ERROR_RATE = 0.3;

export type ValidityFlag =
  | "high_error_rate" // errores > 30 % de todos los ensayos de la dimensión
  | "fast_responses" // > 10 % de ensayos válidos con RT < 300 ms
  | "insufficient_data"; // no se pudo calcular el D-score

export interface ValidityReport {
  /** true ⇒ "✓ Datos válidos"; false ⇒ "⚠️ Revisar calidad de datos". */
  valid: boolean;
  flags: ValidityFlag[];
  /** Errores / todos los ensayos de la dimensión (todos los bloques). */
  errorRate: number;
  /** % de ensayos usados con RT < 300 ms (0–1). */
  fastFraction: number;
  /** N de ensayos válidos usados en el D-score. */
  nUsed: number;
  nTrials: number;
}

export function assessValidity(
  trials: readonly TrialRecord[],
  score: DScoreResult,
): ValidityReport {
  const nTrials = trials.length;
  const errors = trials.filter((t) => t.error).length;
  const errorRate = nTrials > 0 ? errors / nTrials : 0;

  const flags: ValidityFlag[] = [];
  if (errorRate > MAX_ERROR_RATE) flags.push("high_error_rate");
  if (score.fastFraction > MAX_FAST_FRACTION) flags.push("fast_responses");
  if (score.d === null) flags.push("insufficient_data");

  return {
    valid: flags.length === 0,
    flags,
    errorRate,
    fastFraction: score.fastFraction,
    nUsed: score.nUsed,
    nTrials,
  };
}
