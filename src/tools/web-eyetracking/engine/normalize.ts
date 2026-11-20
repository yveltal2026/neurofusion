import { z } from "zod";

export const rawWebGazeSampleSchema = z.object({
  t: z.number().int().min(0).max(3_600_000),
  x: z.number().min(-0.2).max(1.2),
  y: z.number().min(-0.2).max(1.2),
  scrollX: z.number().min(0).max(50_000).default(0),
  scrollY: z.number().min(0).max(100_000).default(0),
  vw: z.number().int().min(100).max(10_000),
  vh: z.number().int().min(100).max(10_000),
  docW: z.number().int().min(100).max(20_000),
  docH: z.number().int().min(100).max(100_000),
  stepId: z.string().trim().min(1).max(16),
  kind: z.enum(["gaze", "click"]).default("gaze"),
});

export type RawWebGazeSample = z.infer<typeof rawWebGazeSampleSchema>;

export interface NormalizedDocPoint {
  t: number;
  docX: number;
  docY: number;
  stepId: string;
  kind: "gaze" | "click";
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Proyecta una muestra de mirada (normalizada al viewport) al espacio del documento
 * completo [0..1] compensando el desplazamiento (scrollX, scrollY).
 */
export function normalizeSampleToDocument(
  sample: RawWebGazeSample,
): NormalizedDocPoint {
  const absX = sample.x * sample.vw + sample.scrollX;
  const absY = sample.y * sample.vh + sample.scrollY;
  return {
    t: sample.t,
    docX: clamp01(absX / sample.docW),
    docY: clamp01(absY / sample.docH),
    stepId: sample.stepId,
    kind: sample.kind,
  };
}
