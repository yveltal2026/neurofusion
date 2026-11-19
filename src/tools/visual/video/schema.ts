import { z } from "zod";
import { eyeQualitySchema } from "../eye/schema";

export const MAX_VIDEO_DURATION_MS = 300_000;

/** Caja normalizada [x0, y0, x1, y1] dentro del rectángulo visible del video. */
export const normalizedBoxSchema = z
  .tuple([
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1),
  ])
  .refine(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0, {
    message: "La caja debe tener ancho y alto positivos (x1 > x0, y1 > y0)",
  });

export const videoAoiKeyframeSchema = z.object({
  tMs: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS),
  box: normalizedBoxSchema,
});

export const videoAoiSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    startMs: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS),
    endMs: z.number().int().min(1).max(MAX_VIDEO_DURATION_MS),
    box: normalizedBoxSchema,
    keyframes: z.array(videoAoiKeyframeSchema).max(120).optional(),
  })
  .superRefine((aoi, ctx) => {
    if (aoi.endMs <= aoi.startMs) {
      ctx.addIssue({
        code: "custom",
        message: "El intervalo de la AOI debe cumplir endMs > startMs",
      });
    }
    if (aoi.keyframes?.length) {
      for (let i = 0; i < aoi.keyframes.length; i++) {
        const kf = aoi.keyframes[i];
        if (kf.tMs < aoi.startMs || kf.tMs > aoi.endMs) {
          ctx.addIssue({
            code: "custom",
            message: "Los keyframes de la AOI deben estar dentro de [startMs, endMs]",
          });
        }
        if (i > 0 && kf.tMs <= aoi.keyframes[i - 1].tMs) {
          ctx.addIssue({
            code: "custom",
            message: "Los keyframes de la AOI deben estar en orden estrictamente creciente de tMs",
          });
        }
      }
    }
  });

export const videoSceneSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    startMs: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS),
    endMs: z.number().int().min(1).max(MAX_VIDEO_DURATION_MS),
  })
  .refine((s) => s.endMs > s.startMs, {
    message: "La escena debe cumplir endMs > startMs",
  });

export const videoGazeSampleSchema = z.object({
  /** Milisegundos en el reloj del medio (video.currentTime * 1000). */
  t: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS),
  /** Coordenadas normalizadas dentro del rectángulo de contenido del video. */
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const auPctSchema = z.number().int().min(0).max(100);

export const videoFacialSampleSchema = z.object({
  /** Milisegundos en el reloj del medio (muestreo típico a 10 Hz = cada 100 ms). */
  t: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS),
  poseValid: z.boolean(),
  au01: auPctSchema,
  au02: auPctSchema,
  au04: auPctSchema,
  au06: auPctSchema,
  au07: auPctSchema,
  au09: auPctSchema,
  au10: auPctSchema,
  au12: auPctSchema,
  au14: auPctSchema,
  au15: auPctSchema,
  au24: auPctSchema,
  au26: auPctSchema,
  blink: z.boolean(),
});

export const videoObservationSchema = z
  .object({
    assetId: z.string().uuid(),
    durationMs: z.number().int().min(1_000).max(MAX_VIDEO_DURATION_MS),
    framesTotal: z.number().int().min(0).max(36_000),
    framesValid: z.number().int().min(0).max(36_000),
    playbackStalls: z.number().int().min(0).max(100).default(0),
    audioMuted: z.boolean().default(false),
    baselineFrames: z.number().int().min(0).max(600).default(0),
    gazeSamples: z.array(videoGazeSampleSchema).max(3_600),
    facialSamples: z.array(videoFacialSampleSchema).max(3_000),
  })
  .superRefine((o, ctx) => {
    if (o.framesValid > o.framesTotal || o.gazeSamples.length > o.framesValid) {
      ctx.addIssue({
        code: "custom",
        message: "Conteos de lecturas de mirada en video inválidos",
      });
    }
    if (
      o.gazeSamples.some(
        (s, i) => s.t > o.durationMs || (i > 0 && s.t < o.gazeSamples[i - 1].t),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Tiempos de lecturas de mirada fuera de orden o de duración",
      });
    }
    if (
      o.facialSamples.some(
        (s, i) =>
          s.t > o.durationMs || (i > 0 && s.t <= o.facialSamples[i - 1].t),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Tiempos de muestras faciales duplicados, fuera de orden o de duración",
      });
    }
  });

export const videoNeuroRunSchema = z.object({
  sessionId: z.string().uuid(),
  quality: eyeQualitySchema,
  observations: z.array(videoObservationSchema).min(1).max(5),
});

export type NormalizedBox = z.infer<typeof normalizedBoxSchema>;
export type VideoAoiKeyframe = z.infer<typeof videoAoiKeyframeSchema>;
export type VideoAoi = z.infer<typeof videoAoiSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoGazeSample = z.infer<typeof videoGazeSampleSchema>;
export type VideoFacialSample = z.infer<typeof videoFacialSampleSchema>;
export type VideoObservation = z.infer<typeof videoObservationSchema>;
export type VideoNeuroRun = z.infer<typeof videoNeuroRunSchema>;
