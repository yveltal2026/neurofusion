import { buildDimensionPlan } from "./blocks";
import { mulberry32 } from "./rng";
import type { FirstCombo, PlannedBlock, Protocol, TrialRecord } from "./types";

export const conceptA = { label: "Marca A", stimuli: ["Marca A"] };
export const conceptB = { label: "Marca B", stimuli: ["Marca B"] };
export const dimension = {
  positiveLabel: "Confiable",
  negativeLabel: "Poco confiable",
  positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
  negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
};

export function plan(protocol: Protocol, combo: FirstCombo, seed = 1): PlannedBlock[] {
  return buildDimensionPlan({
    protocol,
    conceptA,
    conceptB,
    dimension,
    combo,
    rng: mulberry32(seed),
  });
}

/**
 * Participante simulado que asocia A con el polo positivo: es más rápido cuando
 * A comparte tecla con P1 (y B con P2) y más lento en la combinación contraria.
 * `effectMs` es la penalización en la combinación incongruente.
 */
export function simulateParticipant(
  blocks: PlannedBlock[],
  combo: FirstCombo,
  opts: { baseMs?: number; effectMs?: number; seed?: number; errorRate?: number } = {},
): TrialRecord[] {
  const { baseMs = 700, effectMs = 200, seed = 7, errorRate = 0.05 } = opts;
  const rng = mulberry32(seed);
  const out: TrialRecord[] = [];
  for (const block of blocks) {
    // Congruente = A comparte lado con P1 en este bloque combinado.
    const congruent =
      (combo === "A_with_P1") === (block.block === 3 || block.block === 4);
    for (const trial of block.trials) {
      const noise = (rng() - 0.5) * 200; // ±100 ms
      const penalty = block.kind === "combined" && !congruent ? effectMs : 0;
      out.push({
        block: trial.block,
        rtMs: Math.max(350, baseMs + penalty + noise),
        error: rng() < errorRate,
      });
    }
  }
  return out;
}
