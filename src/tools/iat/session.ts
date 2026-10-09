import { z } from "zod";
import { toConceptInput, toDimensionInput, type IatConfig } from "./config";
import { buildDimensionPlan, chooseFirstCombo, mulberry32, scoreDimension } from "./engine";
import type { DimensionScore, FirstCombo, PlannedBlock, Rng, Side, TrialRecord } from "./engine";

/**
 * Lógica de sesión compartida por los endpoints del participante y las pruebas.
 *
 * Idea central: el servidor decide por dimensión el contrabalanceo y una semilla;
 * con ellas cualquiera (cliente o servidor) regenera EXACTAMENTE el mismo plan de
 * ensayos. El cliente sólo reporta qué tecla pulsó y en cuánto tiempo; la
 * categoría, el estímulo y la respuesta correcta salen siempre del plan del
 * servidor, así que un cliente alterado no puede falsear el D-score con ensayos
 * inexistentes ni cambiar qué respuesta era la correcta.
 */

export const MAX_RT_REPORTED_MS = 120_000;
export const MAX_TRIALS_PER_BATCH = 400;

export const counterbalanceSchema = z.array(
  z.object({
    combo: z.enum(["A_with_P1", "A_with_P2"]),
    seed: z.number().int().min(0).max(0xffffffff),
  }),
);
export type CounterbalanceEntry = z.infer<typeof counterbalanceSchema>[number];

export function newCounterbalance(nDimensions: number, rng: Rng): CounterbalanceEntry[] {
  return Array.from({ length: nDimensions }, () => ({
    combo: chooseFirstCombo(rng),
    seed: Math.floor(rng() * 0x100000000),
  }));
}

export function planForDimension(config: IatConfig, dimensionIdx: number, entry: CounterbalanceEntry): PlannedBlock[] {
  const dimension = config.dimensions[dimensionIdx];
  if (!dimension) throw new Error(`Dimensión ${dimensionIdx} inexistente`);
  return buildDimensionPlan({
    protocol: config.protocol,
    conceptA: toConceptInput(config.conceptA),
    conceptB: toConceptInput(config.conceptB),
    dimension: toDimensionInput(dimension),
    combo: entry.combo,
    rng: mulberry32(entry.seed),
  });
}

export function plannedTrialCount(plan: PlannedBlock[]): number {
  return plan.reduce((n, b) => n + b.trials.length, 0);
}

// ------------------------------------------------------------ lotes de ensayos

export const submittedTrialSchema = z.object({
  block: z.number().int().min(1).max(7),
  index: z.number().int().min(0),
  rtMs: z.number().finite().min(0).max(MAX_RT_REPORTED_MS),
  /** Primera tecla/botón pulsado. */
  pressed: z.enum(["left", "right"]),
});
export type SubmittedTrial = z.infer<typeof submittedTrialSchema>;

export const trialBatchSchema = z.object({
  sessionId: z.string().uuid(),
  dimensionIdx: z.number().int().min(0).max(3),
  trials: z.array(submittedTrialSchema).min(1).max(MAX_TRIALS_PER_BATCH),
});

/** Fila lista para insertar en `trials` (sin session_id/study_id, que pone el servidor). */
export interface TrialRowDraft {
  dimension_idx: number;
  block: number;
  trial_idx: number;
  category: "A" | "B" | "P1" | "P2";
  stimulus: string;
  correct_side: Side;
  pressed_side: Side;
  rt_ms: number;
  error: boolean;
}

export type BatchResult = { ok: true; rows: TrialRowDraft[] } | { ok: false; error: string };

/** Cruza un lote enviado por el cliente con el plan regenerado por el servidor. */
export function buildTrialRows(plan: PlannedBlock[], dimensionIdx: number, batch: SubmittedTrial[]): BatchResult {
  const byBlock = new Map(plan.map((b) => [b.block, b]));
  const seen = new Set<string>();
  const rows: TrialRowDraft[] = [];
  for (const t of batch) {
    const block = byBlock.get(t.block as PlannedBlock["block"]);
    const planned = block?.trials[t.index];
    if (!block || !planned) return { ok: false, error: `Ensayo inexistente (bloque ${t.block}, índice ${t.index})` };
    const key = `${t.block}:${t.index}`;
    if (seen.has(key)) return { ok: false, error: `Ensayo duplicado (bloque ${t.block}, índice ${t.index})` };
    seen.add(key);
    rows.push({
      dimension_idx: dimensionIdx,
      block: t.block,
      trial_idx: t.index,
      category: planned.category,
      stimulus: planned.text,
      correct_side: planned.correctSide,
      pressed_side: t.pressed,
      rt_ms: t.rtMs,
      error: t.pressed !== planned.correctSide,
    });
  }
  return { ok: true, rows };
}

// ------------------------------------------------------------ puntuación

export interface StoredTrial {
  dimension_idx: number;
  block: number;
  rt_ms: number;
  error: boolean;
}

export interface DimensionOutcome extends DimensionScore {
  dimensionIdx: number;
  firstCombo: FirstCombo;
  nTrials: number;
}

export type ScoreSessionResult =
  | { complete: true; dimensions: DimensionOutcome[] }
  | { complete: false; missing: { dimensionIdx: number; expected: number; received: number }[] };

/**
 * Puntúa una sesión a partir de los ensayos guardados. Exige que cada dimensión
 * tenga TODOS sus ensayos: una sesión parcial no se marca como completada.
 */
export function scoreSession(
  config: IatConfig,
  counterbalance: CounterbalanceEntry[],
  stored: readonly StoredTrial[],
): ScoreSessionResult {
  const missing: { dimensionIdx: number; expected: number; received: number }[] = [];
  const dimensions: DimensionOutcome[] = [];

  config.dimensions.forEach((_, dimensionIdx) => {
    const entry = counterbalance[dimensionIdx];
    const expected = entry ? plannedTrialCount(planForDimension(config, dimensionIdx, entry)) : 0;
    const rows = stored.filter((r) => r.dimension_idx === dimensionIdx);
    if (!entry || rows.length !== expected) {
      missing.push({ dimensionIdx, expected, received: rows.length });
      return;
    }
    const records: TrialRecord[] = rows.map((r) => ({ block: r.block, rtMs: r.rt_ms, error: r.error }));
    const scored = scoreDimension(records, entry.combo);
    dimensions.push({ dimensionIdx, firstCombo: entry.combo, nTrials: rows.length, ...scored });
  });

  return missing.length ? { complete: false, missing } : { complete: true, dimensions };
}

/** Fila de `session_results` a partir del resultado de una dimensión. */
export function toResultRow(sessionId: string, studyId: string, o: DimensionOutcome) {
  return {
    session_id: sessionId,
    study_id: studyId,
    dimension_idx: o.dimensionIdx,
    first_combo: o.firstCombo,
    d_score: o.score.d,
    strength: o.score.interpretation?.strength ?? null,
    direction: o.score.interpretation?.direction ?? null,
    error_rate: o.validity.errorRate,
    fast_fraction: o.validity.fastFraction,
    n_used: o.validity.nUsed,
    n_trials: o.nTrials,
    valid: o.validity.valid,
    flags: o.validity.flags,
  };
}
