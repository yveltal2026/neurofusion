import { z } from "zod";
import type { Aoi } from "../engine/aoi";
import type { PieceAiResult } from "./piece";

export const PREDICTION_EXPOSURE_MS = 5_000;
export const PREDICTION_VERSION = "ai-eye-scenario-v1";
export const PREDICTION_NOTICE =
  "Predicciones numéricas de IA: no medidas ni validadas con participantes. Escenario hipotético de 5 segundos de exposición.";
export const predictionContextSchema = z.object({
  source: z.literal("ai_prediction_unvalidated"),
  version: z.literal(PREDICTION_VERSION),
  exposureMs: z.literal(PREDICTION_EXPOSURE_MS),
});

/** Inputs predicted by the model. TFD and revisits are derived rather than
 * independently guessed, so their arithmetic stays consistent. */
export const predictedEyeMetricsSchema = z
  .object({
    ttffMs: z.number().int().min(0).max(PREDICTION_EXPOSURE_MS).nullable(),
    fixationCount: z.number().int().min(0).max(40),
    meanFixationDurationMs: z.number().int().min(80).max(1500).nullable(),
    dwellTimeMs: z.number().int().min(0).max(PREDICTION_EXPOSURE_MS),
    hitRatePct: z.number().min(0).max(100),
    firstFixationPct: z.number().min(0).max(100),
    visitCount: z.number().int().min(0).max(40),
    rationale: z.string().trim().min(1).max(400),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (m.firstFixationPct > m.hitRatePct)
      issue("La primera fijación no puede superar el hit rate estimado");
    if (!m.fixationCount) {
      if (
        m.ttffMs !== null ||
        m.meanFixationDurationMs !== null ||
        m.dwellTimeMs !== 0 ||
        m.visitCount !== 0 ||
        m.hitRatePct !== 0 ||
        m.firstFixationPct !== 0
      ) {
        issue(
          "Sin fijaciones, TTFF y FD deben ser null; dwell, visitas y tasas deben ser cero",
        );
      }
      return;
    }
    if (
      m.ttffMs === null ||
      m.meanFixationDurationMs === null ||
      m.visitCount < 1 ||
      m.visitCount > m.fixationCount ||
      m.hitRatePct === 0
    ) {
      issue(
        "Con fijaciones se requieren TTFF, FD, hit rate positivo y entre 1 y FC visitas",
      );
    }
    const total = m.fixationCount * (m.meanFixationDurationMs ?? 0);
    if (
      total > m.dwellTimeMs ||
      (m.ttffMs ?? 0) + m.dwellTimeMs > PREDICTION_EXPOSURE_MS
    ) {
      issue("FC × FD debe ser ≤ dwell y TTFF + dwell debe caber en 5000 ms");
    }
  });
export type PredictedEyeMetrics = z.infer<typeof predictedEyeMetricsSchema>;

export const PREDICTION_PROMPT = `PREDICCIONES NUMÉRICAS NO VALIDADAS
Además de la saliencia, incluye "eyeMetrics" para CADA elemento. Son hipótesis numéricas de IA, NO mediciones ni resultados de personas reales. Usa el mismo escenario hipotético: exposición de ${PREDICTION_EXPOSURE_MS} ms, observador adulto típico del público declarado, sin tarea de búsqueda forzada.
Formato: { "ttffMs": entero o null, "fixationCount": entero 0-40, "meanFixationDurationMs": entero 80-1500 o null, "dwellTimeMs": entero 0-5000, "hitRatePct": número 0-100, "firstFixationPct": número 0-100, "visitCount": entero 0-40, "rationale": "fundamento visual concreto y supuesto que explica esta proyección" }.
FC, FD, dwell y visitas describen un recorrido hipotético típico que observa el área; las tasas son hipótesis poblacionales separadas, sin muestra ni calibración. No las presentes como promedios observados ni probabilidades calibradas.
COHERENCIA: TFD se calcula como FC × FD; regresos = max(visitas - 1, 0). No incluyas esas dos variables redundantes. Debe cumplirse FC × FD ≤ dwell y TTFF + dwell ≤ 5000; 1 ≤ visitas ≤ FC; primera fijación ≤ hit rate. Si prevés que un área no recibe fijaciones: FC=0, TTFF=null, FD=null, dwell=0, visitas=0 y ambas tasas=0. Una estimación baja no implica comprensión ni emoción. La incertidumbre del modelo sigue existiendo aunque se indiquen números.`;

export function aoiPredictions(
  result: PieceAiResult,
  aois: Aoi[],
  analyzedAois: Aoi[],
) {
  return aois.map((aoi) => {
    const original = analyzedAois.find((a) => a.id === aoi.id);
    const unchanged =
      original &&
      original.kind === aoi.kind &&
      original.box.every((n, i) => Math.abs(n - aoi.box[i]) < 1e-6);
    const prediction =
      unchanged && result.predictionContext
        ? result.elements.find((e) => e.id === aoi.id)?.eyeMetrics
        : undefined;
    return {
      aoi,
      prediction: prediction ?? null,
      status: !unchanged
        ? ("edited" as const)
        : prediction
          ? ("predicted" as const)
          : ("legacy" as const),
      totalFixationDurationMs: prediction
        ? prediction.fixationCount * (prediction.meanFixationDurationMs ?? 0)
        : null,
      revisitCount: prediction ? Math.max(0, prediction.visitCount - 1) : null,
    };
  });
}
