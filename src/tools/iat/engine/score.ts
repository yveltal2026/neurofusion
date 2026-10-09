import { computeDScore } from "./dscore";
import type { DScoreResult } from "./dscore";
import { assessValidity } from "./validity";
import type { ValidityReport } from "./validity";
import type { FirstCombo, TrialRecord } from "./types";

export interface DimensionScore {
  score: DScoreResult;
  validity: ValidityReport;
}

/**
 * Punto de entrada único para puntuar una dimensión: D-score + validez.
 * Lo usa el servidor al completar la sesión (recálculo autoritativo) y las
 * pruebas; los resultados del cliente nunca se toman como verdad.
 */
export function scoreDimension(
  trials: readonly TrialRecord[],
  firstCombo: FirstCombo,
): DimensionScore {
  const score = computeDScore(trials, firstCombo);
  return { score, validity: assessValidity(trials, score) };
}
