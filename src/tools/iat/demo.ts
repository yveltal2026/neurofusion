import { defaultConsentText, defaultIatConfig, type IatConfig } from "./config";
import { mulberry32 } from "./engine/rng";
import type { Rng, Side } from "./engine/types";
import {
  buildTrialRows,
  newCounterbalance,
  planForDimension,
  scoreSession,
  toResultRow,
  type CounterbalanceEntry,
  type TrialRowDraft,
} from "./session";

/**
 * Datos de demostración para uso educativo: un estudio de ejemplo y participantes
 * SIMULADOS (claramente sintéticos) que pasan por el mismo plan, validación y
 * puntuación que los reales. Con ellos se puede explorar la plataforma completa
 * (tabla de datos, CSV, análisis) sin recolectar participantes de verdad.
 */

export const DEMO_STUDY_NAME = "Demo educativo · Aurora Café vs. Granos del Sur";

export function demoConfig(): IatConfig {
  return {
    ...defaultIatConfig(),
    product: "café de especialidad",
    comparison: "two_brands",
    conceptA: { label: "Aurora Café", stimuli: ["Aurora Café"] },
    conceptB: { label: "Granos del Sur", stimuli: ["Granos del Sur"] },
    dimensions: [
      {
        id: "confianza",
        name: "Confianza",
        positiveLabel: "Confiable",
        negativeLabel: "Poco confiable",
        positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
        negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
      },
      {
        id: "posicionamiento",
        name: "Posicionamiento",
        positiveLabel: "Premium",
        negativeLabel: "Económico",
        positiveWords: ["Elegante", "Exclusivo", "Refinado", "Distinguido", "Lujoso"],
        negativeWords: ["Barato", "Simple", "Común", "Básico", "Corriente"],
      },
    ],
    protocol: "classic7",
    participant: {
      collectAge: true,
      collectGender: true,
      explicitQuestion: "¿Cuál de estas marcas prefieres?",
      extraFields: [
        { id: "frecuencia", label: "¿Con qué frecuencia consumes café?", type: "select", options: ["Diario", "Semanal", "Ocasional"], required: true },
      ],
    },
    texts: {
      consent: defaultConsentText("café de especialidad"),
      thankYou: "¡Gracias por participar! Tus respuestas se han registrado correctamente.",
    },
  };
}

export type DemoQuality = "good" | "bot" | "sloppy";

export interface SimulatedSession {
  participantRef: string;
  quality: DemoQuality;
  demographics: Record<string, unknown>;
  explicit: "A" | "B" | "neutral";
  deviceType: "desktop" | "mobile" | "tablet";
  inputMode: "keyboard" | "touch";
  counterbalance: CounterbalanceEntry[];
  trials: TrialRowDraft[];
  results: ReturnType<typeof toResultRow>[];
}

const gauss = (rng: Rng) => (rng() + rng() + rng() + rng() - 2) * 1.2;
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** Efecto medio (ms de lentitud en la combinación incongruente) por dimensión de la demo. */
const DEMO_EFFECT_MS = [190, -30];

export function simulateDemoSession(
  config: IatConfig,
  index: number,
  opts: { seed: number; quality?: DemoQuality },
): SimulatedSession {
  const rng = mulberry32(opts.seed + index * 7919);
  const quality: DemoQuality = opts.quality ?? "good";
  const touch = rng() < 0.2;
  const deviceType = touch ? (rng() < 0.85 ? "mobile" : "tablet") : "desktop";
  const counterbalance = newCounterbalance(config.dimensions.length, rng);

  const base = (touch ? 1000 : 720) + gauss(rng) * 90;
  const noise = touch ? 340 : 230;
  const errorRate = quality === "sloppy" ? 0.38 : 0.04 + rng() * 0.07;
  const personalEffect = config.dimensions.map((_, i) => (DEMO_EFFECT_MS[i] ?? 0) + gauss(rng) * 70);

  const trials: TrialRowDraft[] = [];
  config.dimensions.forEach((_, dim) => {
    const plan = planForDimension(config, dim, counterbalance[dim]);
    const aFirst = counterbalance[dim].combo === "A_with_P1";
    const submitted = plan.flatMap((block) => {
      // Congruente: A comparte tecla con el polo positivo en este bloque combinado.
      const congruent = aFirst === (block.block === 3 || block.block === 4);
      return block.trials.map((t) => {
        const penalty = block.kind === "combined" && !congruent ? personalEffect[dim] : 0;
        const rt = quality === "bot" ? 140 + rng() * 120 : Math.max(380, base + penalty + (rng() - 0.5) * noise);
        const wrong = rng() < errorRate;
        const pressed: Side = wrong ? (t.correctSide === "left" ? "right" : "left") : t.correctSide;
        // Un error incluye el tiempo de corrección en el RT (regla del protocolo).
        return { block: block.block, index: t.index, rtMs: Math.round((rt + (wrong ? 250 + rng() * 150 : 0)) * 10) / 10, pressed };
      });
    });
    const built = buildTrialRows(plan, dim, submitted);
    if (!built.ok) throw new Error(built.error);
    trials.push(...built.rows);
  });

  const scored = scoreSession(config, counterbalance, trials);
  if (!scored.complete) throw new Error("La sesión simulada quedó incompleta");

  // Preferencia declarada correlacionada (de forma imperfecta) con el efecto en confianza.
  const lean = personalEffect[0] + gauss(rng) * 140;
  const explicit = rng() < 0.18 ? "neutral" : lean > 40 ? "A" : lean < -40 ? "B" : pick(rng, ["A", "B"] as const);

  const age = 18 + Math.floor(rng() * 42);
  return {
    participantRef: `demo-${String(index + 1).padStart(3, "0")}`,
    quality,
    demographics: {
      age,
      gender: pick(rng, ["Mujer", "Hombre", "No binario", "Prefiero no decir"] as const),
      frecuencia: pick(rng, ["Diario", "Semanal", "Ocasional"] as const),
    },
    explicit,
    deviceType,
    inputMode: touch ? "touch" : "keyboard",
    counterbalance,
    trials,
    // session_id / study_id se completan al insertar.
    results: scored.dimensions.map((d) => toResultRow("", "", d)),
  };
}

/** Población de demostración: mayoría de calidad buena, unos pocos "bots" y respuestas descuidadas. */
export function simulateDemoPopulation(config: IatConfig, n: number, seed = 2026): SimulatedSession[] {
  return Array.from({ length: n }, (_, i) => {
    const quality: DemoQuality = i % 17 === 5 ? "bot" : i % 13 === 7 ? "sloppy" : "good";
    return simulateDemoSession(config, i, { seed, quality });
  });
}
