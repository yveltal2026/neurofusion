import { z } from "zod";
import { AGE_GROUPS, DEFAULT_CALIBRATION, DEFAULT_QUOTAS, LITERACY } from "./journey/calibration";
import { TASK_KINDS } from "./journey/model";
import { videoAoiSchema } from "./video/schema";

const text = (max: number) => z.string().trim().max(max);
const key = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,31}$/, "Clave inválida (minúsculas, números y guiones)");

const pct = z.number().min(0).max(100);
const sum100 = (r: Record<string, number>) => Math.abs(Object.values(r).reduce((a, b) => a + b, 0) - 100) < 0.05;

export const quotasSchema = z.object({
  age: z.object(Object.fromEntries(AGE_GROUPS.map((g) => [g, pct])) as Record<(typeof AGE_GROUPS)[number], typeof pct>).refine(sum100, "Las cuotas de edad deben sumar 100 %"),
  literacy: z.object(Object.fromEntries(LITERACY.map((g) => [g, pct])) as Record<(typeof LITERACY)[number], typeof pct>).refine(sum100, "Las cuotas de alfabetización deben sumar 100 %"),
});

export const siteSchema = z.object({
  key,
  name: text(80).min(1, "Nombre del sitio requerido"),
  url: z.string().trim().url("URL inválida").max(2000),
  competitor: z.boolean(),
});

export const taskSchema = z.object({
  id: z.string().trim().regex(/^T\d{1,2}$/, "Id de tarea inválido"),
  name: text(80).min(1, "Nombre de la tarea requerido"),
  instruction: text(400).min(1, "Instrucción requerida"),
  kind: z.enum(TASK_KINDS),
});

const context = {
  objective: text(600).min(1, "Describe el objetivo"),
  brand: text(120).default(""),
  audience: text(400).default(""),
};

export const eyeTrackingVideoSceneInputSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(120),
    startMs: z.number().int().min(0).max(300_000),
    endMs: z.number().int().min(1).max(300_000),
  })
  .refine((s) => s.endMs > s.startMs, {
    message: "La escena debe cumplir endMs > startMs",
  });

export const eyeTrackingVideoConfigSchema = z.object({
  storage: z.enum(["cloudflare_r2"]).default("cloudflare_r2"),
  maxDurationSeconds: z.number().int().min(5).max(300).default(120),
  r2Key: z.string().trim().min(1).max(500).optional(),
  playbackUrl: z.string().trim().url("URL de video inválida").max(2000).optional(),
  title: text(160).optional(),
  videoWidth: z.number().int().min(64).max(7680).optional(),
  videoHeight: z.number().int().min(64).max(4320).optional(),
  durationMs: z.number().int().min(1000).max(300_000).optional(),
  scenes: z.array(eyeTrackingVideoSceneInputSchema).max(24).default([]),
  aois: z.array(videoAoiSchema).max(30).default([]),
});

export const eyeTrackingConfigSchema = z.object({
  mediaType: z.enum(["image", "video"]).optional(),
  durationSeconds: z.number().int().min(5).max(30).default(10),
  facialCoding: z.boolean().optional(),
  video: eyeTrackingVideoConfigSchema.optional(),
});

export type EyeTrackingConfig = z.infer<typeof eyeTrackingConfigSchema>;

export function resolveEyeMediaType(eye?: EyeTrackingConfig): "image" | "video" {
  return eye?.mediaType ?? "image";
}

export function isEyeFacialCodingEnabled(eye?: EyeTrackingConfig): boolean {
  return eye?.facialCoding ?? false;
}

export const piecesConfigSchema = z.object({
  mode: z.literal("pieces"),
  ...context,
  /** Presente sólo cuando las piezas se miden con una webcam de participantes. */
  eyeTracking: eyeTrackingConfigSchema.optional(),
});

export const journeyConfigSchema = z
  .object({
    mode: z.literal("journey"),
    ...context,
    productTarget: text(160).default(""),
    sites: z.array(siteSchema).min(1).max(6),
    tasks: z.array(taskSchema).min(1).max(8),
    panel: z.object({
      seed: z.number().int().min(1).max(2_147_483_647),
      calibration: text(40).min(1).default(DEFAULT_CALIBRATION),
      quotas: quotasSchema.default(DEFAULT_QUOTAS),
    }),
    /** Estudio del que es re-medición (las calificaciones se hacen de nuevo). */
    remeasurementOf: z.string().uuid().nullable().default(null),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.sites.map((s) => s.key)).size !== c.sites.length) ctx.addIssue({ code: "custom", message: "Hay sitios repetidos" });
    if (new Set(c.tasks.map((t) => t.id)).size !== c.tasks.length) ctx.addIssue({ code: "custom", message: "Hay tareas repetidas" });
    if (c.sites.filter((s) => !s.competitor).length !== 1) ctx.addIssue({ code: "custom", message: "Debe haber exactamente un sitio principal (el resto son competidores)" });
  });

export const visualConfigSchema = z.discriminatedUnion("mode", [piecesConfigSchema, journeyConfigSchema]);

export type VisualConfig = z.infer<typeof visualConfigSchema>;
export type PiecesConfig = z.infer<typeof piecesConfigSchema>;
export type JourneyConfig = z.infer<typeof journeyConfigSchema>;
export type JourneySite = z.infer<typeof siteSchema>;
export type JourneyTask = z.infer<typeof taskSchema>;

/** Slug estable para la clave de un sitio. */
export function siteKey(name: string, taken: string[] = []): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "sitio";
  let k = base;
  for (let i = 2; taken.includes(k); i++) k = `${base}-${i}`;
  return k;
}
