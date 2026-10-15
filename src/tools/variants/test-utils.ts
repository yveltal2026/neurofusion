import type { VariantConfig } from "./config";
import type { VariantRecord } from "./results/load";
import { buildPlan, flatTrials, planHash, type VariantPlan } from "./plan";
import { resolveResponses, scoreVariant, type Submission } from "./score";

/** Sólo para pruebas: genera las respuestas de un participante simulado a partir del plan de su sesión. */
export function simulate(
  plan: VariantPlan,
  behave: (t: ReturnType<typeof flatTrials>[number], i: number) => { key: "left" | "right" | "go" | null; rtMs: number | null },
): Submission {
  return { planHash: planHash(plan), responses: flatTrials(plan).map((f, i) => ({ seq: i, ...behave(f, i) })) };
}

let counter = 0;

/** Sólo para pruebas: un registro de resultados puntuado por el MISMO código del servidor. */
export function recordFor(
  config: VariantConfig,
  behave: Parameters<typeof simulate>[1],
  extra: Partial<VariantRecord> = {},
): VariantRecord {
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  const plan = buildPlan(config, id);
  const resolved = resolveResponses(config, plan, simulate(plan, behave));
  if (!resolved.ok) throw new Error(resolved.detail);
  const scores = scoreVariant(config, plan, resolved.trials);
  return {
    id,
    participantRef: `P${counter}`,
    deviceType: "desktop",
    startedAt: `2026-10-15T10:${String(counter % 60).padStart(2, "0")}:00Z`,
    completedAt: `2026-10-15T10:${String(counter % 60).padStart(2, "0")}:30Z`,
    excluded: false,
    excludedReason: null,
    scores,
    primary: scores.primary,
    valid: scores.valid,
    flags: scores.flags,
    ...extra,
  };
}

/** SC-IAT: respuestas correctas; `posMs` y `negMs` son los tiempos con cada emparejamiento (con algo de variación). */
export function scBehaviour(posMs: number, negMs: number): Parameters<typeof simulate>[1] {
  return ({ block, trial }, i) => ({
    key: (trial as { correctSide: "left" | "right" }).correctSide,
    rtMs: block.practice ? 800 : ((block as unknown as { pairing: string }).pairing === "target_positive" ? posMs : negMs) + (i % 7) * 12,
  });
}

/** Siempre la misma tecla: el participante «apretó por apretar». */
export const alwaysLeft: Parameters<typeof simulate>[1] = (_, i) => ({ key: "left", rtMs: 500 + (i % 5) * 10 });
