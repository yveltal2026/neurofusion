import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const WEB_EYE_MODES = ["live_snippet", "no_code_captures"] as const;
export type WebEyeMode = (typeof WEB_EYE_MODES)[number];

export const hotspotSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.01).max(1),
});

export type WebEyeHotspot = z.infer<typeof hotspotSchema>;

export const webEyeStepSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^S\d{1,2}$/, "Id de paso inválido (p. ej. S1)"),
  title: text(100).min(1, "Escribe un título para el paso"),
  instruction: text(400).min(1, "Escribe la instrucción para el participante"),
  advanceOn: z.enum(["manual", "url_match", "hotspot"]).default("manual"),
  urlPattern: text(300).optional(),
  assetId: z.string().uuid().optional(),
  hotspot: hotspotSchema.optional(),
});

export type WebEyeStep = z.infer<typeof webEyeStepSchema>;

export const webEyetrackingConfigSchema = z
  .object({
    mode: z.enum(WEB_EYE_MODES).default("live_snippet"),
    targetUrl: z
      .string()
      .trim()
      .url("Ingresa una URL válida (https://...)")
      .max(2000),
    allowedOrigins: z
      .array(z.string().trim().url("Origen inválido").max(300))
      .max(10)
      .default([]),
    steps: z
      .array(webEyeStepSchema)
      .min(1, "Define al menos un paso para el participante")
      .max(12),
    calibration: z
      .object({
        points: z.union([z.literal(5), z.literal(9)]).default(9),
        maxDurationSeconds: z.number().int().min(30).max(900).default(180),
      })
      .default({ points: 9, maxDurationSeconds: 180 }),
  })
  .superRefine((c, ctx) => {
    const ids = c.steps.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Los identificadores de pasos no pueden repetirse",
      });
    }
    for (const step of c.steps) {
      if (step.advanceOn === "url_match" && !step.urlPattern?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: `El paso ${step.id} requiere un patrón de URL para avanzar automáticamente`,
        });
      }
      if (step.advanceOn === "hotspot" && !step.hotspot) {
        ctx.addIssue({
          code: "custom",
          message: `El paso ${step.id} requiere definir un hotspot clicable`,
        });
      }
    }
  });

export type WebEyetrackingConfig = z.infer<typeof webEyetrackingConfigSchema>;

/** Deriva el origen base (scheme + host + port) a partir de una URL válida. */
export function originFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
