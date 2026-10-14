import { mean } from "@/tools/iat/engine/math";
import {
  getInstrument,
  instrumentItemId,
  type InstrumentId,
} from "./instruments";
import type { SurveyAnswers, SurveyConfig } from "./schema";

/** Puntuación determinista de instrumentos. Nada de esto pasa por la IA. */

export type NpsCategory = "promoter" | "passive" | "detractor";

export type InstrumentScore =
  | { instrument: "sus"; score: number }
  | { instrument: "nps"; value: number; category: NpsCategory }
  | { instrument: "sam"; valence: number; arousal: number; dominance: number }
  | { instrument: "purchase_intent"; value: number; topTwoBox: boolean }
  | { instrument: "attitude"; score: number };

/** Promedio publicado de SUS (Sauro, 2011); sólo como referencia orientativa. */
export const SUS_BENCHMARK = 68;

export function npsCategory(value: number): NpsCategory {
  if (value >= 9) return "promoter";
  if (value >= 7) return "passive";
  return "detractor";
}

/**
 * Valores de un instrumento en el orden de sus ítems, o null si falta alguno o
 * no es un entero dentro de la escala.
 */
export function readInstrumentValues(
  instrumentId: InstrumentId,
  blockId: string,
  answers: SurveyAnswers,
): number[] | null {
  const inst = getInstrument(instrumentId);
  const values: number[] = [];
  for (const item of inst.items) {
    const v = answers[instrumentItemId(blockId, item.n)];
    if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < inst.scale.min ||
      v > inst.scale.max
    )
      return null;
    values.push(v);
  }
  return values;
}

/** Puntúa un instrumento a partir de sus valores (en el orden de los ítems). Null si no es válido. */
export function scoreInstrument(
  instrumentId: InstrumentId,
  values: readonly number[],
): InstrumentScore | null {
  const inst = getInstrument(instrumentId);
  if (values.length !== inst.items.length) return null;
  if (
    values.some(
      (v) => !Number.isInteger(v) || v < inst.scale.min || v > inst.scale.max,
    )
  )
    return null;

  switch (instrumentId) {
    case "sus": {
      // Ítems impares: valor − 1. Ítems pares: 5 − valor. Suma × 2,5 → 0–100.
      let sum = 0;
      values.forEach((v, i) => {
        sum += (i + 1) % 2 === 1 ? v - 1 : 5 - v;
      });
      return { instrument: "sus", score: sum * 2.5 };
    }
    case "nps": {
      const value = values[0]!;
      return { instrument: "nps", value, category: npsCategory(value) };
    }
    case "sam":
      return {
        instrument: "sam",
        valence: values[0]!,
        arousal: values[1]!,
        dominance: values[2]!,
      };
    case "purchase_intent": {
      const value = values[0]!;
      return { instrument: "purchase_intent", value, topTwoBox: value >= 4 };
    }
    case "attitude":
      return { instrument: "attitude", score: mean(values) };
  }
}

/** Valores orientados en la misma dirección (los ítems inversos se invierten); base de la consistencia interna. */
export function directionalValues(
  instrumentId: InstrumentId,
  values: readonly number[],
): number[] {
  const inst = getInstrument(instrumentId);
  return values.map((v, i) =>
    inst.items[i]?.reverse ? inst.scale.min + inst.scale.max - v : v,
  );
}

/**
 * Alfa de Cronbach. Filas = participantes con todos los ítems, columnas = ítems
 * (ya orientados en la misma dirección). Null si hay menos de 2 filas o 2 ítems,
 * o si la varianza del total es 0.
 */
export function cronbachAlpha(
  rows: readonly (readonly number[])[],
): number | null {
  const n = rows.length;
  const k = rows[0]?.length ?? 0;
  if (n < 2 || k < 2 || rows.some((r) => r.length !== k)) return null;
  const variance = (xs: readonly number[]) => {
    const m = mean(xs);
    return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  };
  let itemVars = 0;
  for (let j = 0; j < k; j++) itemVars += variance(rows.map((r) => r[j]!));
  const totalVar = variance(rows.map((r) => r.reduce((s, x) => s + x, 0)));
  if (totalVar === 0) return null;
  return (k / (k - 1)) * (1 - itemVars / totalVar);
}

export interface BlockScore {
  blockId: string;
  instrumentId: InstrumentId;
  /** Null si el participante no completó el instrumento. */
  score: InstrumentScore | null;
}

/** Puntúa todos los instrumentos de una encuesta para un participante. */
export function scoreSurvey(
  config: SurveyConfig,
  answers: SurveyAnswers,
): BlockScore[] {
  const out: BlockScore[] = [];
  for (const b of config.blocks) {
    if (b.kind !== "instrument") continue;
    const values = readInstrumentValues(b.instrumentId, b.id, answers);
    out.push({
      blockId: b.id,
      instrumentId: b.instrumentId,
      score: values ? scoreInstrument(b.instrumentId, values) : null,
    });
  }
  return out;
}
