import { z } from "zod";
import {
  primingEffect,
  scoreGnat,
  scorePriming,
  scoreScIat,
  VARIANTS_ENGINE_VERSION,
  type GnatCounts,
  type GnatResult,
  type PrimeScore,
  type ScIatResult,
  type VariantFlag,
} from "@/tools/iat/engine/variants";
import { MAX_FAST_FRACTION } from "@/tools/iat/engine/dscore";
import type { VariantConfig } from "./config";
import { flatTrials, planHash, totalTrials, CONTROL_PRIME, type GnatBlock, type GnatTrial, type PrimingTrial, type ResponseKey, type ScBlock, type ScTrial, type VariantPlan } from "./plan";

/** Respuestas que envía el participante: sólo la tecla y la latencia de cada ensayo, en el orden del plan. */
export const submissionSchema = z.object({
  planHash: z.string().regex(/^[0-9a-f]{8}$/),
  responses: z
    .array(
      z.object({
        seq: z.number().int().min(0),
        key: z.enum(["left", "right", "go"]).nullable(),
        rtMs: z.number().min(0).max(10_000).nullable(),
      }),
    )
    .max(1500),
});
export type Submission = z.infer<typeof submissionSchema>;

/** Margen sobre la ventana de respuesta que se tolera por la imprecisión de los temporizadores del navegador. */
export const RT_TOLERANCE_MS = 250;
/** Respuestas «go» más rápidas que esto se consideran anticipaciones (heurística propia, no de la literatura). */
export const GNAT_ANTICIPATION_MS = 200;
/** d′ global por debajo del cual el GNAT se marca (heurística propia). */
export const MIN_GNAT_POOLED_DPRIME = 0.5;

export interface ResolvedTrial {
  seq: number;
  blockId: string;
  practice: boolean;
  key: ResponseKey;
  rtMs: number | null;
  /** SC-IAT y priming: tecla correcta pulsada. GNAT: acierto o rechazo correcto. */
  correct: boolean;
}

export type ValidateResult = { ok: true; trials: ResolvedTrial[] } | { ok: false; detail: string };

/** Límite de tiempo de respuesta de la variante, en ms. */
export function responseLimitMs(config: VariantConfig): number {
  switch (config.variant) {
    case "sc_iat":
      return config.params.windowMs;
    case "gnat":
      return config.params.deadlineMs;
    case "priming":
      return config.params.maxResponseMs;
  }
}

/** Comprueba la forma de las respuestas contra el plan regenerado por el servidor y calcula los aciertos. */
export function resolveResponses(config: VariantConfig, plan: VariantPlan, sub: Submission): ValidateResult {
  if (sub.planHash !== planHash(plan)) return { ok: false, detail: "El plan no coincide con el del servidor" };
  const flat = flatTrials(plan);
  if (sub.responses.length !== totalTrials(plan)) return { ok: false, detail: "Número de respuestas incorrecto" };
  const limit = responseLimitMs(config) + RT_TOLERANCE_MS;
  const trials: ResolvedTrial[] = [];
  for (let i = 0; i < flat.length; i++) {
    const r = sub.responses[i];
    const { block, trial } = flat[i];
    if (r.seq !== i) return { ok: false, detail: `responses.${i}.seq` };
    if ((r.key === null) !== (r.rtMs === null)) return { ok: false, detail: `responses.${i}: tecla y latencia deben ir juntas` };
    if (r.rtMs !== null && r.rtMs > limit) return { ok: false, detail: `responses.${i}.rtMs fuera de la ventana` };
    let correct: boolean;
    if (plan.variant === "gnat") {
      if (r.key === "left" || r.key === "right") return { ok: false, detail: `responses.${i}.key` };
      const t = trial as GnatTrial;
      correct = t.signal ? r.key === "go" : r.key === null;
    } else {
      if (r.key === "go") return { ok: false, detail: `responses.${i}.key` };
      correct = r.key !== null && r.key === (trial as ScTrial | PrimingTrial).correctSide;
    }
    trials.push({ seq: i, blockId: block.id, practice: block.practice, key: r.key, rtMs: r.rtMs, correct });
  }
  return { ok: true, trials };
}

// ---------------------------------------------------------------- puntuación

export interface ScDetail {
  kind: "sc_iat";
  result: ScIatResult;
}
export interface GnatBlockScore {
  blockId: string;
  conceptIdx: number;
  pole: "positive" | "negative";
  counts: GnatCounts;
  result: GnatResult;
  meanHitRtMs: number | null;
}
export interface GnatDetail {
  kind: "gnat";
  blocks: GnatBlockScore[];
  /** d′(concepto + positivo) − d′(concepto + negativo), por concepto. Positivo = asociación más fuerte con lo positivo. */
  contrasts: (number | null)[];
  pooled: GnatResult;
  anticipationFraction: number;
}
export interface PrimingDetail {
  kind: "priming";
  byPrime: PrimeScore[];
  /** sesgo(concepto) − sesgo(control), en ms, por concepto. */
  effects: (number | null)[];
  errorRate: number;
}

export interface VariantScores {
  variant: VariantConfig["variant"];
  engineVersion: string;
  /** Medida principal: D (SC-IAT), contraste de d′ (GNAT) o efecto en ms (priming). Null si no se pudo calcular. */
  primary: number | null;
  primaryUnit: "d" | "d_prime" | "ms";
  flags: VariantFlag[];
  /** true ⇒ sin advertencias de calidad. */
  valid: boolean;
  detail: ScDetail | GnatDetail | PrimingDetail;
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

function addCounts(a: GnatCounts, b: GnatCounts): GnatCounts {
  return {
    hits: a.hits + b.hits,
    misses: a.misses + b.misses,
    falseAlarms: a.falseAlarms + b.falseAlarms,
    correctRejections: a.correctRejections + b.correctRejections,
  };
}

export function scoreVariant(config: VariantConfig, plan: VariantPlan, trials: readonly ResolvedTrial[]): VariantScores {
  const measured = trials.filter((t) => !t.practice);
  const byBlock = new Map<string, ResolvedTrial[]>();
  for (const t of measured) byBlock.set(t.blockId, [...(byBlock.get(t.blockId) ?? []), t]);
  const flat = flatTrials(plan);

  if (plan.variant === "sc_iat" && config.variant === "sc_iat") {
    const blocks = plan.blocks as ScBlock[];
    const pairingOf = new Map(blocks.map((b) => [b.id, b.pairing] as const));
    const result = scoreScIat(
      measured.map((t) => ({ pairing: pairingOf.get(t.blockId) as ScBlock["pairing"], rtMs: t.rtMs, error: !t.correct })),
      { windowMs: config.params.windowMs },
    );
    return {
      variant: "sc_iat",
      engineVersion: VARIANTS_ENGINE_VERSION,
      primary: result.d,
      primaryUnit: "d",
      flags: result.flags,
      valid: result.flags.length === 0,
      detail: { kind: "sc_iat", result },
    };
  }

  if (plan.variant === "gnat") {
    const signalOf = new Map(flat.map(({ trial }) => [trial.seq, (trial as GnatTrial).signal] as const));
    const blocks: GnatBlockScore[] = [];
    let pooledCounts: GnatCounts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
    let goCount = 0;
    let anticipations = 0;
    for (const b of (plan.blocks as GnatBlock[]).filter((x) => !x.practice)) {
      const ts = byBlock.get(b.id) ?? [];
      const counts: GnatCounts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
      const hitRts: number[] = [];
      for (const t of ts) {
        const signal = signalOf.get(t.seq) === true;
        const went = t.key === "go";
        if (went) {
          goCount++;
          if ((t.rtMs ?? Infinity) < GNAT_ANTICIPATION_MS) anticipations++;
        }
        if (signal && went) {
          counts.hits++;
          if (t.rtMs !== null) hitRts.push(t.rtMs);
        } else if (signal) counts.misses++;
        else if (went) counts.falseAlarms++;
        else counts.correctRejections++;
      }
      pooledCounts = addCounts(pooledCounts, counts);
      blocks.push({
        blockId: b.id,
        conceptIdx: b.conceptIdx,
        pole: b.pole,
        counts,
        result: scoreGnat(counts),
        meanHitRtMs: hitRts.length ? hitRts.reduce((a, c) => a + c, 0) / hitRts.length : null,
      });
    }
    const dOf = (conceptIdx: number, pole: "positive" | "negative") =>
      blocks.find((b) => b.conceptIdx === conceptIdx && b.pole === pole)?.result.dPrime ?? null;
    const contrasts = config.concepts.map((_, ci) => diff(dOf(ci, "positive"), dOf(ci, "negative")));
    const primary = contrasts.length === 2 ? diff(contrasts[0], contrasts[1]) : (contrasts[0] ?? null);
    const pooled = scoreGnat(pooledCounts);
    const flags: VariantFlag[] = [];
    if (primary === null || blocks.some((b) => b.result.dPrime === null)) flags.push("insufficient_data");
    if (pooled.dPrime !== null && pooled.dPrime < MIN_GNAT_POOLED_DPRIME) flags.push("low_discrimination");
    const anticipationFraction = goCount ? anticipations / goCount : 0;
    if (anticipationFraction > MAX_FAST_FRACTION) flags.push("fast_responses");
    return {
      variant: "gnat",
      engineVersion: VARIANTS_ENGINE_VERSION,
      primary,
      primaryUnit: "d_prime",
      flags,
      valid: flags.length === 0,
      detail: { kind: "gnat", blocks, contrasts, pooled, anticipationFraction },
    };
  }

  // Priming
  const primeOf = new Map(flat.map(({ trial }) => [trial.seq, trial as PrimingTrial] as const));
  const scored = scorePriming(
    measured.map((t) => {
      const pt = primeOf.get(t.seq) as PrimingTrial;
      return {
        prime: pt.prime,
        targetValence: pt.targetValence,
        rtMs: t.rtMs ?? (config.variant === "priming" ? config.params.maxResponseMs : 0),
        error: !t.correct,
      };
    }),
  );
  const effects = config.concepts.map((_, ci) => primingEffect(scored, `c${ci}`, CONTROL_PRIME));
  const primary = effects.length === 2 ? diff(effects[0], effects[1]) : (effects[0] ?? null);
  const flags = [...scored.flags];
  if (primary === null && !flags.includes("insufficient_data")) flags.push("insufficient_data");
  return {
    variant: "priming",
    engineVersion: VARIANTS_ENGINE_VERSION,
    primary,
    primaryUnit: "ms",
    flags,
    valid: flags.length === 0,
    detail: { kind: "priming", byPrime: scored.byPrime, effects, errorRate: scored.errorRate },
  };
}
