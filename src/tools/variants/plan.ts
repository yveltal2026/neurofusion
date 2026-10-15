import { mulberry32, shuffle } from "@/tools/iat/engine/rng";
import type { Rng } from "@/tools/iat/engine/types";
import type { GnatConfig, PrimingConfig, ScIatConfig, VariantConfig } from "./config";

/**
 * Plan de ensayos de una sesión: qué estímulo aparece en cada posición y cuál es la respuesta
 * correcta. Es una función pura de (configuración, id de sesión): el navegador la usa para
 * presentar los ensayos y el servidor la regenera para validar y puntuar, así que el cliente
 * sólo envía qué tecla pulsó y cuánto tardó, nunca estímulos ni aciertos.
 */

export type Side = "left" | "right";
/** Respuesta del participante: tecla izquierda/derecha, «go» (GNAT) o ninguna a tiempo. */
export type ResponseKey = Side | "go" | null;

export const PLAN_VERSION = "nf-variants-plan-1";

/** Hash FNV-1a de 32 bits. Ni es criptográfico ni lo necesita: reparte semillas y detecta planes distintos. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seedFromSessionId(sessionId: string): number {
  return fnv1a(`${PLAN_VERSION}:${sessionId}`);
}

// ---------------------------------------------------------------- tipos del plan

export interface BlockBase {
  id: string;
  /** Práctica: con retroalimentación y fuera de la puntuación. */
  practice: boolean;
}

export interface ScTrial {
  seq: number;
  category: "target" | "positive" | "negative";
  stimulusId: string;
  text: string;
  correctSide: Side;
}
export type ScPairing = "target_positive" | "target_negative";
export interface ScBlock extends BlockBase {
  pairing: ScPairing;
  /** Tecla compartida por el concepto y el polo emparejado. */
  sharedSide: Side;
  trials: ScTrial[];
}

export interface GnatTrial {
  seq: number;
  /** Origen del estímulo: del concepto de la combinación, del polo de la combinación o distractor. */
  category: "concept" | "attribute" | "noise_attribute" | "noise_concept";
  /** Debe responderse («go») sólo si es señal. */
  signal: boolean;
  stimulusId: string;
  text: string;
}
export interface GnatBlock extends BlockBase {
  conceptIdx: number;
  pole: "positive" | "negative";
  trials: GnatTrial[];
}

export interface PrimingTrial {
  seq: number;
  /** "c0", "c1" o "control". */
  prime: string;
  primeText: string;
  targetValence: "positive" | "negative";
  stimulusId: string;
  text: string;
  correctSide: Side;
}
export interface PrimingBlock extends BlockBase {
  trials: PrimingTrial[];
}

export type VariantPlan =
  | { variant: "sc_iat"; seed: number; sharedSide: Side; blocks: ScBlock[] }
  | { variant: "gnat"; seed: number; blocks: GnatBlock[] }
  | { variant: "priming"; seed: number; positiveSide: Side; blocks: PrimingBlock[] };

export const CONTROL_PRIME = "control";
export const CONTROL_PRIME_TEXT = "XXXXXX";

/** Todos los ensayos del plan en orden de presentación (el índice coincide con `seq`). */
export function flatTrials(plan: VariantPlan): { block: BlockBase; trial: ScTrial | GnatTrial | PrimingTrial }[] {
  const out: { block: BlockBase; trial: ScTrial | GnatTrial | PrimingTrial }[] = [];
  for (const block of plan.blocks as (ScBlock | GnatBlock | PrimingBlock)[]) {
    for (const trial of block.trials as (ScTrial | GnatTrial | PrimingTrial)[]) out.push({ block, trial });
  }
  return out;
}

/** Huella del plan: si cliente y servidor generaron lo mismo, coincide. */
export function planHash(plan: VariantPlan): string {
  const parts = flatTrials(plan).map(({ trial }) => `${trial.seq}:${trial.stimulusId}`);
  return fnv1a(parts.join("|")).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- utilidades

const other = (s: Side): Side => (s === "left" ? "right" : "left");

/** Reparte los elementos de una lista barajada de forma cíclica, sin repetir el mismo dos veces seguidas. */
function cycler<T>(items: readonly T[], rng: Rng): () => T {
  let queue: T[] = [];
  let last: T | undefined;
  return () => {
    if (queue.length === 0) {
      queue = shuffle(items, rng);
      if (items.length > 1 && queue[0] === last) queue.push(queue.shift() as T);
    }
    last = queue.shift() as T;
    return last;
  };
}

/** Baraja evitando rachas largas de una misma clave (hasta `maxRun` seguidas). */
function shuffleNoLongRuns<T>(items: readonly T[], key: (t: T) => string, maxRun: number, rng: Rng): T[] {
  let best = shuffle(items, rng);
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = attempt === 0 ? best : shuffle(items, rng);
    let run = 1;
    let ok = true;
    for (let i = 1; i < candidate.length && ok; i++) {
      run = key(candidate[i]) === key(candidate[i - 1]) ? run + 1 : 1;
      if (run > maxRun) ok = false;
    }
    if (ok) return candidate;
    best = candidate;
  }
  return best;
}

// ---------------------------------------------------------------- SC-IAT

function buildScIat(config: ScIatConfig, seed: number): VariantPlan {
  const rng = mulberry32(seed);
  const sharedSide: Side = rng() < 0.5 ? "left" : "right";
  const firstPairing: ScPairing = rng() < 0.5 ? "target_positive" : "target_negative";
  const order: ScPairing[] = firstPairing === "target_positive" ? ["target_positive", "target_negative"] : ["target_negative", "target_positive"];

  const targets = config.concepts[0].stimuli.map((text, i) => ({ stimulusId: `t:0:${i}`, text }));
  const positives = config.attribute.positiveWords.map((text, i) => ({ stimulusId: `p:${i}`, text }));
  const negatives = config.attribute.negativeWords.map((text, i) => ({ stimulusId: `n:${i}`, text }));

  const blocks: ScBlock[] = [];
  let seq = 0;
  for (const pairing of order) {
    for (const practice of [true, false]) {
      const n = practice ? config.params.practiceTrials : config.params.testTrials;
      const nextOf = { target: cycler(targets, rng), positive: cycler(positives, rng), negative: cycler(negatives, rng) };
      // Categorías en tercios barajados: cada tercio aporta una vez cada categoría.
      const categories: ScTrial["category"][] = [];
      while (categories.length < n) categories.push(...shuffle<ScTrial["category"]>(["target", "positive", "negative"], rng));
      categories.length = n;
      const ordered = shuffleNoLongRuns(categories, (c) => c, 3, rng);
      const trials: ScTrial[] = ordered.map((category) => {
        const item = nextOf[category]();
        const withShared = category === "target" || (pairing === "target_positive" ? category === "positive" : category === "negative");
        return { seq: seq++, category, stimulusId: item.stimulusId, text: item.text, correctSide: withShared ? sharedSide : other(sharedSide) };
      });
      blocks.push({ id: `sc_${practice ? "practice" : "test"}_${pairing}`, practice, pairing, sharedSide, trials });
    }
  }
  return { variant: "sc_iat", seed, sharedSide, blocks };
}

// ---------------------------------------------------------------- GNAT

function buildGnat(config: GnatConfig, seed: number): VariantPlan {
  const rng = mulberry32(seed);
  const concepts = config.concepts.map((c, ci) => c.stimuli.map((text, i) => ({ stimulusId: `t:${ci}:${i}`, text })));
  const positives = config.attribute.positiveWords.map((text, i) => ({ stimulusId: `p:${i}`, text }));
  const negatives = config.attribute.negativeWords.map((text, i) => ({ stimulusId: `n:${i}`, text }));

  const combos: { conceptIdx: number; pole: "positive" | "negative" }[] = [];
  concepts.forEach((_, conceptIdx) => combos.push({ conceptIdx, pole: "positive" }, { conceptIdx, pole: "negative" }));
  const orderedCombos = shuffle(combos, rng);

  const blocks: GnatBlock[] = [];
  let seq = 0;
  for (const combo of orderedCombos) {
    const sameAttr = combo.pole === "positive" ? positives : negatives;
    const oppositeAttr = combo.pole === "positive" ? negatives : positives;
    const ownConcept = concepts[combo.conceptIdx];
    const otherConcept = concepts.length === 2 ? concepts[1 - combo.conceptIdx] : null;

    for (const practice of [true, false]) {
      const n = practice ? config.params.practiceTrials : config.params.trialsPerBlock;
      if (n === 0) continue;
      const nSignal = Math.ceil(n / 2);
      const nNoise = n - nSignal;
      const nConceptSignal = Math.ceil(nSignal / 2);
      const nNoiseConcept = otherConcept ? Math.floor(nNoise / 2) : 0;
      const nextOwn = cycler(ownConcept, rng);
      const nextSame = cycler(sameAttr, rng);
      const nextOpposite = cycler(oppositeAttr, rng);
      const nextOther = otherConcept ? cycler(otherConcept, rng) : null;

      type Draft = Omit<GnatTrial, "seq">;
      const drafts: Draft[] = [];
      for (let i = 0; i < nSignal; i++) {
        const isConcept = i < nConceptSignal;
        const item = isConcept ? nextOwn() : nextSame();
        drafts.push({ category: isConcept ? "concept" : "attribute", signal: true, ...item });
      }
      for (let i = 0; i < nNoise; i++) {
        const isConcept = i < nNoiseConcept && nextOther !== null;
        const item = isConcept ? (nextOther as () => { stimulusId: string; text: string })() : nextOpposite();
        drafts.push({ category: isConcept ? "noise_concept" : "noise_attribute", signal: false, ...item });
      }
      const trials: GnatTrial[] = shuffleNoLongRuns(drafts, (d) => String(d.signal), 3, rng).map((d) => ({ seq: seq++, ...d }));
      blocks.push({ id: `gnat_${practice ? "practice" : "test"}_c${combo.conceptIdx}_${combo.pole}`, practice, ...combo, trials });
    }
  }
  return { variant: "gnat", seed, blocks };
}

// ---------------------------------------------------------------- Priming

function buildPriming(config: PrimingConfig, seed: number): VariantPlan {
  const rng = mulberry32(seed);
  const positiveSide: Side = rng() < 0.5 ? "left" : "right";
  const sideOf = (v: "positive" | "negative"): Side => (v === "positive" ? positiveSide : other(positiveSide));

  const words = [
    ...config.attribute.positiveWords.map((text, i) => ({ stimulusId: `p:${i}`, text, targetValence: "positive" as const })),
    ...config.attribute.negativeWords.map((text, i) => ({ stimulusId: `n:${i}`, text, targetValence: "negative" as const })),
  ];
  const primes = [
    ...config.concepts.map((c, ci) => ({ id: `c${ci}`, texts: c.stimuli })),
    { id: CONTROL_PRIME, texts: [CONTROL_PRIME_TEXT] },
  ];
  const nextPrimeText = new Map(primes.map((p) => [p.id, cycler(p.texts, rng)] as const));

  const make = (picks: { prime: string; word: (typeof words)[number] }[], startSeq: number): PrimingTrial[] =>
    picks.map((pick, i) => ({
      seq: startSeq + i,
      prime: pick.prime,
      primeText: (nextPrimeText.get(pick.prime) as () => string)(),
      targetValence: pick.word.targetValence,
      stimulusId: pick.word.stimulusId,
      text: pick.word.text,
      correctSide: sideOf(pick.word.targetValence),
    }));

  const order = (picks: { prime: string; word: (typeof words)[number] }[]) => {
    // Sin la misma palabra dos veces seguidas ni más de 3 ensayos seguidos con el mismo prime.
    let best = shuffleNoLongRuns(picks, (p) => p.prime, 3, rng);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (!best.some((p, i) => i > 0 && p.word.stimulusId === best[i - 1].word.stimulusId)) break;
      best = shuffleNoLongRuns(picks, (p) => p.prime, 3, rng);
    }
    return best;
  };

  const blocks: PrimingBlock[] = [];
  let seq = 0;
  if (config.params.practiceTrials > 0) {
    const pool = shuffle(words, rng).slice(0, config.params.practiceTrials);
    // La práctica usa el prime de control: no presenta la marca antes de medir.
    const trials = make(
      pool.map((word) => ({ prime: CONTROL_PRIME, word })),
      seq,
    );
    seq += trials.length;
    blocks.push({ id: "priming_practice", practice: true, trials });
  }
  const picks: { prime: string; word: (typeof words)[number] }[] = [];
  for (let r = 0; r < config.params.repetitions; r++) {
    for (const p of primes) for (const word of words) picks.push({ prime: p.id, word });
  }
  blocks.push({ id: "priming_test", practice: false, trials: make(order(picks), seq) });
  return { variant: "priming", seed, positiveSide, blocks };
}

export function buildPlan(config: VariantConfig, sessionId: string): VariantPlan {
  const seed = seedFromSessionId(sessionId);
  switch (config.variant) {
    case "sc_iat":
      return buildScIat(config, seed);
    case "gnat":
      return buildGnat(config, seed);
    case "priming":
      return buildPriming(config, seed);
  }
}

export function totalTrials(plan: VariantPlan): number {
  return plan.blocks.reduce((n, b) => n + b.trials.length, 0);
}

/** Minutos aproximados que dura la sesión (para decirlo en la bienvenida y en el wizard). */
export function estimateVariantMinutes(config: VariantConfig): number {
  const plan = buildPlan(config, "estimate");
  const n = totalTrials(plan);
  const perTrialMs =
    config.variant === "sc_iat"
      ? Math.min(config.params.windowMs, 900) + 500
      : config.variant === "gnat"
        ? config.params.deadlineMs + 600
        : config.params.primeMs + config.params.blankMs + 700 + 600;
  const blocks = plan.blocks.length;
  return Math.max(1, Math.round((n * perTrialMs) / 60000 + blocks * 0.15));
}
