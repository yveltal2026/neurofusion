import { z } from "zod";
import type { ConceptInput, DimensionInput } from "./engine";

/**
 * Configuración de un estudio IAT (lo que produce el wizard). Se guarda en
 * `studies.config` y se valida igual en el cliente (por paso) y en el servidor
 * (autoritativo, al crear el estudio).
 */

export const MAX_DIMENSIONS = 4;
export const MIN_WORDS_PER_POLE = 5;
export const MAX_WORDS_PER_POLE = 10;
export const MAX_EXTRA_FIELDS = 5;

/** Claves reservadas en `sessions.demographics`. */
export const RESERVED_FIELD_IDS = ["age", "gender", "explicit"] as const;

const text = (max: number, min = 1) => z.string().trim().min(min, "Campo obligatorio").max(max, `Máximo ${max} caracteres`);
const word = z.string().trim().min(1).max(24, "Máximo 24 caracteres por palabra");

/** Normaliza para comparar palabras sin importar mayúsculas ni acentos. */
export function normalizeWord(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export const conceptSchema = z.object({
  label: text(40),
  /** Estímulos de texto que representan al concepto (por defecto, su propio nombre). */
  stimuli: z.array(text(40)).min(1).max(10),
});

export const dimensionBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "Identificador inválido"),
  /** Nombre visible de la dimensión, p. ej. "Confianza". */
  name: text(60),
  /** Polo positivo (P1): el que favorecería a la marca si se asocia a ella. */
  positiveLabel: text(40),
  negativeLabel: text(40),
  positiveWords: z.array(word).min(MIN_WORDS_PER_POLE, `Mínimo ${MIN_WORDS_PER_POLE} palabras por polo`).max(MAX_WORDS_PER_POLE),
  negativeWords: z.array(word).min(MIN_WORDS_PER_POLE, `Mínimo ${MIN_WORDS_PER_POLE} palabras por polo`).max(MAX_WORDS_PER_POLE),
});

export const dimensionSchema = dimensionBaseSchema.superRefine((d, ctx) => {
  if (normalizeWord(d.positiveLabel) === normalizeWord(d.negativeLabel)) {
    ctx.addIssue({ code: "custom", path: ["negativeLabel"], message: "Los dos polos deben ser distintos" });
  }
  const seen = new Set<string>();
  for (const key of ["positiveWords", "negativeWords"] as const) {
    d[key].forEach((w, i) => {
      const n = normalizeWord(w);
      if (seen.has(n)) {
        ctx.addIssue({ code: "custom", path: [key, i], message: `La palabra «${w}» está repetida` });
      }
      seen.add(n);
    });
  }
});

const extraBase = {
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "Identificador inválido"),
  label: text(80),
  required: z.boolean(),
};

export const extraFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...extraBase, type: z.literal("text") }),
  z.object({
    ...extraBase,
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    ...extraBase,
    type: z.literal("select"),
    options: z.array(text(40)).min(2, "Agrega al menos 2 opciones").max(12),
  }),
]);

export const participantSchema = z.object({
  /** Edad: opcional para el participante. */
  collectAge: z.boolean(),
  /** Género: opcional para el participante. */
  collectGender: z.boolean(),
  /** Pregunta de preferencia explícita (siempre obligatoria para el participante). */
  explicitQuestion: text(200),
  extraFields: z.array(extraFieldSchema).max(MAX_EXTRA_FIELDS),
});

export const themeSchema = z.object({
  mode: z.enum(["neutral", "custom"]),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .optional(),
});

export const iatConfigSchema = z
  .object({
    version: z.literal(1),
    product: text(120),
    comparison: z.enum(["two_brands", "brand_vs_category", "brand_vs_ideal"]),
    conceptA: conceptSchema,
    conceptB: conceptSchema,
    dimensions: z.array(dimensionSchema).min(1, "Agrega al menos una dimensión").max(MAX_DIMENSIONS, `Máximo ${MAX_DIMENSIONS} dimensiones`),
    protocol: z.enum(["classic7", "demo5"]),
    participant: participantSchema,
    theme: themeSchema,
    texts: z.object({
      consent: text(4000),
      thankYou: text(1000),
    }),
    /** "inform": aviso amable en móvil; "suggest_desktop": aviso que sugiere cambiar de dispositivo. */
    deviceNotice: z.enum(["inform", "suggest_desktop"]),
  })
  .superRefine((c, ctx) => {
    if (normalizeWord(c.conceptA.label) === normalizeWord(c.conceptB.label)) {
      ctx.addIssue({ code: "custom", path: ["conceptB", "label"], message: "Los dos conceptos deben tener nombres distintos" });
    }
    const dimIds = new Set<string>();
    c.dimensions.forEach((d, i) => {
      if (dimIds.has(d.id)) ctx.addIssue({ code: "custom", path: ["dimensions", i, "id"], message: "Dimensión duplicada" });
      dimIds.add(d.id);
    });
    const fieldIds = new Set<string>(RESERVED_FIELD_IDS);
    c.participant.extraFields.forEach((f, i) => {
      if (fieldIds.has(f.id)) {
        ctx.addIssue({ code: "custom", path: ["participant", "extraFields", i, "id"], message: "Identificador de campo repetido o reservado" });
      }
      fieldIds.add(f.id);
    });
    if (c.theme.mode === "custom" && !c.theme.accent) {
      ctx.addIssue({ code: "custom", path: ["theme", "accent"], message: "Elige un color" });
    }
  });

export type IatConfig = z.infer<typeof iatConfigSchema>;
export type IatDimension = z.infer<typeof dimensionSchema>;
export type ExtraField = z.infer<typeof extraFieldSchema>;

export const GENDER_OPTIONS = ["Mujer", "Hombre", "No binario", "Prefiero no decir"] as const;
export const NEUTRAL_OPTION_LABEL = "Ninguna / me da igual";

export function defaultConsentText(product: string): string {
  return [
    `Estás invitado(a) a participar en un estudio sobre ${product || "percepción de marcas"}.`,
    "Se te pedirá clasificar palabras con el teclado o la pantalla lo más rápido que puedas. Dura pocos minutos.",
    "Tu participación es voluntaria y anónima: no te pedimos nombre ni correo. Tus respuestas se usarán sólo con fines de investigación y se analizarán de forma agregada.",
    "Puedes abandonar el estudio en cualquier momento cerrando esta ventana. Al continuar confirmas que eres mayor de edad y que aceptas participar.",
  ].join("\n\n");
}

export const DEFAULT_THANK_YOU = "¡Gracias por participar! Tus respuestas se han registrado correctamente. Ya puedes cerrar esta ventana.";

export function defaultIatConfig(): IatConfig {
  return {
    version: 1,
    product: "",
    comparison: "two_brands",
    conceptA: { label: "", stimuli: [] },
    conceptB: { label: "", stimuli: [] },
    dimensions: [],
    protocol: "classic7",
    participant: {
      collectAge: true,
      collectGender: true,
      explicitQuestion: "¿Cuál de estas opciones prefieres?",
      extraFields: [],
    },
    theme: { mode: "neutral" },
    texts: { consent: "", thankYou: DEFAULT_THANK_YOU },
    deviceNotice: "inform",
  };
}

/** Estímulos efectivos de un concepto: los definidos o, si no hay, su nombre. */
export function conceptStimuli(c: { label: string; stimuli: string[] }): string[] {
  const own = c.stimuli.map((s) => s.trim()).filter(Boolean);
  return own.length ? own : [c.label.trim()];
}

/** Adaptadores hacia el motor IAT. */
export function toConceptInput(c: IatConfig["conceptA"]): ConceptInput {
  return { label: c.label, stimuli: conceptStimuli(c) };
}

export function toDimensionInput(d: IatDimension): DimensionInput {
  return {
    positiveLabel: d.positiveLabel,
    negativeLabel: d.negativeLabel,
    positiveWords: d.positiveWords,
    negativeWords: d.negativeWords,
  };
}

/** Convierte un texto libre (líneas o comas) en una lista de palabras limpias. */
export function parseWordList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Crea un identificador seguro (a-z0-9_) a partir de una etiqueta. */
export function slugify(label: string, fallback: string): string {
  const s = normalizeWord(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || fallback;
}
