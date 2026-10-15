/**
 * Variantes del IAT: puntuación pura de SC-IAT, Go/No-Go (GNAT) y priming afectivo.
 *
 * Lo usan el servidor (src/tools/variants/score.ts) y las pruebas. Las constantes son parámetros
 * configurables con valores por defecto tomados de la literatura citada; NO se han cotejado
 * contra los conjuntos de datos originales de esas publicaciones (ver docs/METODOLOGIA.md).
 *
 * Todo es código puro (sin I/O) para correr igual en cliente, servidor y pruebas.
 */
import { normalQuantile } from "@/lib/sample-size";
import { MAX_FAST_FRACTION } from "./dscore";
import { mean, sampleSd } from "./math";
import { MAX_ERROR_RATE } from "./validity";

export const VARIANTS_ENGINE_VERSION = "nf-iat-variants-1.0";

export type VariantFlag =
  | "high_error_rate"
  | "fast_responses"
  | "insufficient_data"
  /** GNAT: d′ global bajo (el participante casi no distingue señal de ruido). Heurística propia, no de la literatura. */
  | "low_discrimination";

// ---------------------------------------------------------------- SC-IAT

/**
 * SC-IAT (Karpinski & Steinman, 2006): un solo concepto objetivo y un atributo de dos polos.
 * En un bloque el concepto comparte tecla con el polo positivo; en el otro, con el negativo.
 * Hay una ventana de respuesta corta: sin respuesta a tiempo cuenta como error.
 */
export interface ScIatTrial {
  /** Bloque de la sesión: concepto con el polo positivo («target_positive») o con el negativo. */
  pairing: "target_positive" | "target_negative";
  /** Latencia en ms; null si no respondió dentro de la ventana. */
  rtMs: number | null;
  /** Primera respuesta incorrecta. */
  error: boolean;
}

export interface ScIatOptions {
  /** Ventana de respuesta en ms (por defecto 1500). */
  windowMs?: number;
  /** Se descartan las latencias menores (por defecto 350 ms). */
  minRtMs?: number;
  /** Penalización en ms que se suma a la media de aciertos del bloque al sustituir un error (por defecto 400, según la descripción del SC-IAT de Karpinski y Steinman, 2006; el IAT clásico usa 600). */
  errorPenaltyMs?: number;
}

export interface ScIatResult {
  /** Positivo = más rápido cuando el concepto comparte tecla con el polo positivo (asociación positiva). Null si no se pudo calcular. */
  d: number | null;
  nUsed: number;
  meanTargetPositive: number | null;
  meanTargetNegative: number | null;
  /** Desviación típica agrupada de todas las latencias usadas (ya con los errores sustituidos). */
  pooledSd: number | null;
  errorRate: number;
  fastFraction: number;
  flags: VariantFlag[];
}

export function scoreScIat(trials: readonly ScIatTrial[], opts: ScIatOptions = {}): ScIatResult {
  const windowMs = opts.windowMs ?? 1500;
  const minRtMs = opts.minRtMs ?? 350;
  const penalty = opts.errorPenaltyMs ?? 400;

  const total = trials.length;
  // Sin respuesta a tiempo = error con latencia igual a la ventana.
  const normalized = trials.map((t) => {
    const timedOut = t.rtMs === null || t.rtMs > windowMs;
    return { pairing: t.pairing, rt: timedOut ? windowMs : (t.rtMs as number), error: t.error || timedOut };
  });

  const fast = normalized.filter((t) => t.rt < minRtMs && !t.error).length;
  const kept = normalized.filter((t) => !(t.rt < minRtMs && !t.error));
  const errors = kept.filter((t) => t.error).length;
  const errorRate = total > 0 ? errors / total : 0;
  const fastFraction = total > 0 ? fast / total : 0;

  const flags: VariantFlag[] = [];
  if (errorRate > MAX_ERROR_RATE) flags.push("high_error_rate");
  if (fastFraction > MAX_FAST_FRACTION) flags.push("fast_responses");

  const used: Record<ScIatTrial["pairing"], number[]> = { target_positive: [], target_negative: [] };
  for (const pairing of ["target_positive", "target_negative"] as const) {
    const block = kept.filter((t) => t.pairing === pairing);
    const correct = block.filter((t) => !t.error).map((t) => t.rt);
    if (correct.length === 0) continue;
    const replacement = mean(correct) + penalty;
    used[pairing] = block.map((t) => (t.error ? replacement : t.rt));
  }

  const pos = used.target_positive;
  const neg = used.target_negative;
  const nUsed = pos.length + neg.length;
  if (pos.length < 2 || neg.length < 2) {
    flags.push("insufficient_data");
    return { d: null, nUsed, meanTargetPositive: pos.length ? mean(pos) : null, meanTargetNegative: neg.length ? mean(neg) : null, pooledSd: null, errorRate, fastFraction, flags };
  }
  const sd = sampleSd([...pos, ...neg]);
  if (!(sd > 0)) {
    flags.push("insufficient_data");
    return { d: null, nUsed, meanTargetPositive: mean(pos), meanTargetNegative: mean(neg), pooledSd: null, errorRate, fastFraction, flags };
  }
  const meanPos = mean(pos);
  const meanNeg = mean(neg);
  return { d: (meanNeg - meanPos) / sd, nUsed, meanTargetPositive: meanPos, meanTargetNegative: meanNeg, pooledSd: sd, errorRate, fastFraction, flags };
}

// ---------------------------------------------------------------- Go/No-Go (GNAT)

/**
 * GNAT (Nosek & Banaji, 2001): en cada bloque el participante responde («go») a los estímulos que
 * pertenecen a la combinación objetivo (concepto + atributo) y se abstiene («no-go») ante los demás.
 * La medida es la sensibilidad d′ de detección de señal. Se compara d′ entre combinaciones.
 */
export interface GnatCounts {
  /** Señal con respuesta a tiempo. */
  hits: number;
  /** Señal sin respuesta. */
  misses: number;
  /** Ruido con respuesta. */
  falseAlarms: number;
  /** Ruido sin respuesta. */
  correctRejections: number;
}

export interface GnatResult {
  dPrime: number | null;
  /** Criterio de respuesta c (negativo = sesgo a responder). */
  criterion: number | null;
  hitRate: number | null;
  falseAlarmRate: number | null;
  flags: VariantFlag[];
}

/**
 * d′ = z(aciertos) − z(falsas alarmas). Con `correction: "loglinear"` (por defecto, Hautus, 1995) se suma 0.5
 * a cada conteo y 1 a cada total, para evitar tasas de 0 o 1 (z infinito).
 */
export function scoreGnat(counts: GnatCounts, correction: "loglinear" | "none" = "loglinear"): GnatResult {
  const signal = counts.hits + counts.misses;
  const noise = counts.falseAlarms + counts.correctRejections;
  const flags: VariantFlag[] = [];
  if (signal < 1 || noise < 1) {
    return { dPrime: null, criterion: null, hitRate: null, falseAlarmRate: null, flags: ["insufficient_data"] };
  }
  const add = correction === "loglinear" ? 0.5 : 0;
  const tot = correction === "loglinear" ? 1 : 0;
  const h = (counts.hits + add) / (signal + tot);
  const f = (counts.falseAlarms + add) / (noise + tot);
  if (!(h > 0 && h < 1 && f > 0 && f < 1)) {
    return { dPrime: null, criterion: null, hitRate: counts.hits / signal, falseAlarmRate: counts.falseAlarms / noise, flags: ["insufficient_data"] };
  }
  const zh = normalQuantile(h);
  const zf = normalQuantile(f);
  return { dPrime: zh - zf, criterion: -(zh + zf) / 2, hitRate: counts.hits / signal, falseAlarmRate: counts.falseAlarms / noise, flags };
}

// ---------------------------------------------------------------- Priming evaluativo

/**
 * Priming evaluativo (Fazio et al., 1986; Hermans et al., 2001): un prime (la marca) precede a una
 * palabra objetivo positiva o negativa que el participante clasifica por su valencia. Si el prime
 * activa una evaluación positiva, las palabras positivas se clasifican más rápido que las negativas.
 *
 * Como la valencia de una marca no se conoce de antemano, no se define «congruencia»: el sesgo de
 * cada prime es media(RT negativas) − media(RT positivas) y el efecto de la marca se expresa
 * contra un prime de control (p. ej. una cadena sin significado), que absorbe la ventaja general
 * de las palabras positivas.
 */
export interface PrimingTrial {
  /** Identificador del prime (concepto o control). */
  prime: string;
  targetValence: "positive" | "negative";
  rtMs: number;
  error: boolean;
}

export interface PrimingOptions {
  /** Latencias fuera de [minRtMs, maxRtMs] se descartan (por defecto 200 y 2000 ms). */
  minRtMs?: number;
  maxRtMs?: number;
  /** Mínimo de ensayos válidos por valencia y prime para calcular (por defecto 4). */
  minPerCell?: number;
}

export interface PrimeScore {
  prime: string;
  /** media(RT a palabras negativas) − media(RT a positivas), en ms. Positivo = favorece lo positivo. */
  biasMs: number | null;
  meanPositive: number | null;
  meanNegative: number | null;
  nPositive: number;
  nNegative: number;
}

export interface PrimingResult {
  byPrime: PrimeScore[];
  errorRate: number;
  flags: VariantFlag[];
}

export function scorePriming(trials: readonly PrimingTrial[], opts: PrimingOptions = {}): PrimingResult {
  const minRt = opts.minRtMs ?? 200;
  const maxRt = opts.maxRtMs ?? 2000;
  const minN = opts.minPerCell ?? 4;
  const errors = trials.filter((t) => t.error).length;
  const errorRate = trials.length ? errors / trials.length : 0;
  const flags: VariantFlag[] = [];
  if (errorRate > MAX_ERROR_RATE) flags.push("high_error_rate");

  const primes = [...new Set(trials.map((t) => t.prime))];
  const byPrime = primes.map((prime): PrimeScore => {
    const ok = trials.filter((t) => t.prime === prime && !t.error && t.rtMs >= minRt && t.rtMs <= maxRt);
    const pos = ok.filter((t) => t.targetValence === "positive").map((t) => t.rtMs);
    const neg = ok.filter((t) => t.targetValence === "negative").map((t) => t.rtMs);
    const enough = pos.length >= minN && neg.length >= minN;
    return {
      prime,
      biasMs: enough ? mean(neg) - mean(pos) : null,
      meanPositive: pos.length ? mean(pos) : null,
      meanNegative: neg.length ? mean(neg) : null,
      nPositive: pos.length,
      nNegative: neg.length,
    };
  });
  if (byPrime.length === 0 || byPrime.some((p) => p.biasMs === null)) flags.push("insufficient_data");
  return { byPrime, errorRate, flags };
}

/** Efecto de un prime contra el de control: bias(prime) − bias(control). Null si falta alguno. */
export function primingEffect(result: PrimingResult, prime: string, baseline: string): number | null {
  const a = result.byPrime.find((p) => p.prime === prime)?.biasMs;
  const b = result.byPrime.find((p) => p.prime === baseline)?.biasMs;
  return a == null || b == null ? null : a - b;
}
