import { blockSides, sideOf } from "./counterbalance";
import { getBlockSpecs } from "./protocol";
import { shuffle } from "./rng";
import type {
  CategoryId,
  ConceptInput,
  DimensionInput,
  FirstCombo,
  PlannedBlock,
  PlannedTrial,
  Protocol,
  Rng,
} from "./types";

export interface BuildPlanInput {
  protocol: Protocol;
  conceptA: ConceptInput;
  conceptB: ConceptInput;
  dimension: DimensionInput;
  combo: FirstCombo;
  rng: Rng;
}

interface Item {
  category: CategoryId;
  stimulusId: string;
  text: string;
}

/** Máximo de ensayos seguidos de la misma categoría. */
const MAX_RUN = 3;
const ARRANGE_ATTEMPTS = 300;

function poolFor(input: BuildPlanInput, category: CategoryId): Item[] {
  const { conceptA, conceptB, dimension } = input;
  const texts =
    category === "A"
      ? conceptA.stimuli
      : category === "B"
        ? conceptB.stimuli
        : category === "P1"
          ? dimension.positiveWords
          : dimension.negativeWords;
  return texts.map((text, i) => ({
    category,
    stimulusId: `${category}:${i}`,
    text,
  }));
}

/** Reparte `n` ensayos entre categorías lo más parejo posible; el resto al azar. */
function distribute(n: number, cats: CategoryId[], rng: Rng): Map<CategoryId, number> {
  const base = Math.floor(n / cats.length);
  const remainder = n - base * cats.length;
  const counts = new Map(cats.map((c) => [c, base] as const));
  for (const c of shuffle(cats, rng).slice(0, remainder)) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

/** Toma `count` estímulos recorriendo el pool en ciclos barajados (uso parejo). */
function draw(pool: Item[], count: number, rng: Rng): Item[] {
  const out: Item[] = [];
  while (out.length < count) out.push(...shuffle(pool, rng));
  return out.slice(0, count);
}

function violations(seq: Item[], poolSizes: Map<CategoryId, number>): number {
  let v = 0;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (
      prev.stimulusId === cur.stimulusId &&
      (poolSizes.get(cur.category) ?? 1) >= 2
    ) {
      v++;
    }
    run = prev.category === cur.category ? run + 1 : 1;
    if (run > MAX_RUN) v++;
  }
  return v;
}

/**
 * Baraja evitando repetir inmediatamente un estímulo (cuando su categoría tiene
 * ≥ 2) y rachas largas de una misma categoría. Reintenta; si no logra 0
 * violaciones devuelve la mejor secuencia encontrada.
 */
function arrange(items: Item[], poolSizes: Map<CategoryId, number>, rng: Rng): Item[] {
  let best = shuffle(items, rng);
  let bestV = violations(best, poolSizes);
  for (let attempt = 0; attempt < ARRANGE_ATTEMPTS && bestV > 0; attempt++) {
    const candidate = shuffle(items, rng);
    const v = violations(candidate, poolSizes);
    if (v < bestV) {
      best = candidate;
      bestV = v;
    }
  }
  return best;
}

function interleave(first: Item[], second: Item[]): Item[] {
  const out: Item[] = [];
  const len = Math.max(first.length, second.length);
  for (let i = 0; i < len; i++) {
    if (i < first.length) out.push(first[i]);
    if (i < second.length) out.push(second[i]);
  }
  return out;
}

/**
 * Genera el plan completo (todos los bloques y ensayos) de UNA dimensión.
 *
 * - Bloques de una sola tarea (1, 2, 5): estímulos balanceados entre las dos
 *   categorías, mezclados.
 * - Bloques combinados (3, 4, 6, 7): mitad ensayos de concepto y mitad de
 *   atributo, alternados; dentro de cada mitad, categorías balanceadas.
 */
export function buildDimensionPlan(input: BuildPlanInput): PlannedBlock[] {
  const { protocol, combo, rng } = input;

  const pools: Record<CategoryId, Item[]> = {
    A: poolFor(input, "A"),
    B: poolFor(input, "B"),
    P1: poolFor(input, "P1"),
    P2: poolFor(input, "P2"),
  };
  const poolSizes = new Map<CategoryId, number>(
    (Object.keys(pools) as CategoryId[]).map((c) => [c, pools[c].length]),
  );

  const sample = (cats: CategoryId[], n: number): Item[] => {
    const counts = distribute(n, cats, rng);
    const items: Item[] = [];
    for (const c of cats) items.push(...draw(pools[c], counts.get(c) ?? 0, rng));
    return arrange(items, poolSizes, rng);
  };

  return getBlockSpecs(protocol).map((spec) => {
    const sides = blockSides(spec.block, combo);

    let sequence: Item[];
    if (spec.kind === "concepts") {
      sequence = sample(["A", "B"], spec.trials);
    } else if (spec.kind === "attributes") {
      sequence = sample(["P1", "P2"], spec.trials);
    } else {
      const nConcept = Math.floor(spec.trials / 2);
      const concepts = sample(["A", "B"], nConcept);
      const attributes = sample(["P1", "P2"], spec.trials - nConcept);
      // Inicio aleatorio (concepto o atributo) para no fijar un patrón.
      sequence =
        rng() < 0.5
          ? interleave(concepts, attributes)
          : interleave(attributes, concepts);
    }

    const trials: PlannedTrial[] = sequence.map((item, index) => {
      const side = sideOf(item.category, sides);
      if (!side) {
        // Defensa: un estímulo fuera de las categorías del bloque indicaría un bug del plan.
        throw new Error(
          `Categoría ${item.category} sin lado asignado en el bloque ${spec.block}`,
        );
      }
      return {
        block: spec.block,
        index,
        category: item.category,
        stimulusId: item.stimulusId,
        text: item.text,
        correctSide: side,
      };
    });

    return {
      block: spec.block,
      kind: spec.kind,
      role: spec.role,
      countsForD: spec.countsForD,
      leftCategories: sides.left,
      rightCategories: sides.right,
      trials,
    };
  });
}
