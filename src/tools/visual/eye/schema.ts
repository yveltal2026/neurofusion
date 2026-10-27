import { z } from "zod";
import { THRESHOLDS } from "@/lab/eyetracking/metrics";
import { driftCheckpoints, driftPasses } from "@/lab/eyetracking/drift";

export const eyeSampleSchema = z.object({
  /** Milisegundos desde que se mostró la imagen. */
  t: z.number().int().min(0).max(30_000),
  /** Coordenadas dentro de la imagen, no del viewport. */
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const eyeObservationSchema = z.object({
  assetId: z.string().uuid(),
  durationMs: z.number().int().min(4_500).max(31_000),
  framesTotal: z.number().int().min(0).max(4_000),
  framesValid: z.number().int().min(0).max(4_000),
  samples: z.array(eyeSampleSchema).max(1_800),
}).superRefine((o, ctx) => {
  if (o.framesValid > o.framesTotal || o.samples.length > o.framesValid) {
    ctx.addIssue({ code: "custom", message: "Conteos de lecturas inválidos" });
  }
  if (o.samples.some((sample, i) => sample.t > o.durationMs || (i > 0 && sample.t < o.samples[i - 1].t))) {
    ctx.addIssue({ code: "custom", message: "Tiempos de lecturas inválidos" });
  }
});

const driftCheckSchema = z.object({
  afterAssetCount: z.number().int().min(0).max(5),
  medianErrorDeg: z.number().finite().min(0).max(90).nullable(),
  maxErrorDeg: z.number().finite().min(0).max(90).nullable(),
  coverage: z.number().finite().min(0).max(1),
  fps: z.number().finite().min(0).max(120),
  validRatio: z.number().finite().min(0).max(1),
  passed: z.boolean(),
});

export const eyeQualitySchema = z.object({
  engineId: z.literal("webeyetrack@0.0.2"),
  measurementStatus: z.enum(["validated", "limited"]).optional(),
  medianErrorDeg: z.number().finite().min(0).max(90).nullable(),
  coverage: z.number().finite().min(0).max(1),
  fps: z.number().finite().min(0).max(120),
  validRatio: z.number().finite().min(0).max(1),
  passed: z.boolean(),
  calibrationClicks: z.number().int().min(9).max(18),
  calibrationLayout: z.string().max(40),
  driftChecks: z.array(driftCheckSchema).max(8).optional(),
  recovery: z.object({
    interruptions: z.number().int().min(1).max(100),
    recalibrations: z.number().int().min(0).max(100),
    repeatedAssetIds: z.array(z.string().uuid()).max(5),
    /** Historial separado: una medición fallida descarta el bloque, no invalida los bloques repetidos y validados. */
    checks: z.array(driftCheckSchema).min(1).max(24),
  }).optional(),
});

export const eyeRunSchema = z.object({
  sessionId: z.string().uuid(),
  quality: eyeQualitySchema,
  observations: z.array(eyeObservationSchema).min(1).max(5),
});

export type EyeObservation = z.infer<typeof eyeObservationSchema>;
export type EyeQuality = z.infer<typeof eyeQualitySchema>;
export type EyeRun = z.infer<typeof eyeRunSchema>;

/** Las imágenes y el tiempo se fijan desde el estudio; el cliente no los puede sustituir. */
export function observationsMatchStudy(observations: EyeObservation[], assetIds: string[], durationSeconds: number): boolean {
  return observations.length === assetIds.length && observations.every((o, i) =>
    o.assetId === assetIds[i] && Math.abs(o.durationMs - durationSeconds * 1000) <= 1500,
  );
}

/** El servidor calcula el veredicto con los datos recibidos y el dispositivo de la sesión. */
export function requiredDriftChecksPass(q: EyeQuality, deviceType: string, assetCount?: number, required = false): boolean {
  if (!q.calibrationLayout.startsWith("v5-")) return !required;
  if (!assetCount) return false;
  const expected = driftCheckpoints(assetCount);
  const device = deviceType === "mobile" ? "phone" : deviceType === "tablet" ? "tablet" : "laptop";
  if (q.recovery) {
    const last = q.recovery.checks.at(-1);
    if (!last || !driftPasses(last, device) || q.recovery.checks.some((c) => !expected.includes(c.afterAssetCount))) return false;
  }
  return q.driftChecks?.length === expected.length && q.driftChecks.every((check, i) =>
    check.afterAssetCount === expected[i] && driftPasses(check, device));
}

/** Sólo eye-v3 permite completar una participación limitada; todas sus mediciones quedan excluidas. */
export function completionAllowed(q: EyeQuality, deviceType: string, assetCount: number, protocol: string): boolean {
  if (q.measurementStatus !== "limited") return requiredDriftChecksPass(q, deviceType, assetCount, protocol !== "eye-v1");
  if (protocol !== "eye-v3" || !q.calibrationLayout.startsWith("v5-") || !q.recovery || q.recovery.interruptions < 2) return false;
  const expected = driftCheckpoints(assetCount);
  const device = deviceType === "mobile" ? "phone" : deviceType === "tablet" ? "tablet" : "laptop";
  return q.driftChecks?.length === expected.length
    && q.driftChecks.every((check, i) => check.afterAssetCount === expected[i])
    && q.recovery.checks.every((check) => expected.includes(check.afterAssetCount))
    && q.recovery.checks.some((check) => !driftPasses(check, device));
}

export function qualityPasses(q: EyeQuality, deviceType: string, assetCount?: number): boolean {
  if (q.measurementStatus === "limited") return false;
  const limit = deviceType === "mobile" || deviceType === "tablet"
    ? THRESHOLDS.maxMedianErrorDeg.phone
    : THRESHOLDS.maxMedianErrorDeg.laptop;
  return q.coverage >= 0.75 && q.medianErrorDeg !== null
    && q.medianErrorDeg <= limit && q.fps >= THRESHOLDS.minFps && requiredDriftChecksPass(q, deviceType, assetCount);
}
