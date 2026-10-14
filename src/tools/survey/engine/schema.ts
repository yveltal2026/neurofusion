import { z } from "zod";
import { INSTRUMENT_IDS, getInstrument, instrumentItemId } from "./instruments";

/**
 * Configuración de una encuesta (lo que produce el wizard) y validación de
 * respuestas. Se valida igual en el cliente y, de forma autoritativa, en el
 * servidor. Todo es código puro, sin I/O.
 */

export const SURVEY_ENGINE_VERSION = "nf-survey-1.0";

export const MAX_BLOCKS = 20;
export const MAX_QUESTIONS_PER_BLOCK = 30;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 12;
export const LIKERT_MIN_POINTS = 3;
export const LIKERT_MAX_POINTS = 10;
export const MAX_TEXT_ANSWER = 1000;

const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, "Campo obligatorio")
    .max(max, `Máximo ${max} caracteres`);
const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,29}$/, "Identificador inválido");

/** Compara textos ignorando mayúsculas y acentos. */
export function normalizeText(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const optionsSchema = z
  .array(text(60))
  .min(MIN_OPTIONS, `Agrega al menos ${MIN_OPTIONS} opciones`)
  .max(MAX_OPTIONS);

function refineUniqueOptions(q: { options: string[] }, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  q.options.forEach((o, i) => {
    const n = normalizeText(o);
    if (seen.has(n))
      ctx.addIssue({
        code: "custom",
        path: ["options", i],
        message: `La opción «${o}» está repetida`,
      });
    seen.add(n);
  });
}

const base = { id: idSchema, prompt: text(300), required: z.boolean() };

export const questionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text") }),
  z.object({
    ...base,
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z
    .object({ ...base, type: z.literal("select"), options: optionsSchema })
    .superRefine(refineUniqueOptions),
  z
    .object({ ...base, type: z.literal("multiselect"), options: optionsSchema })
    .superRefine(refineUniqueOptions),
  z.object({
    ...base,
    type: z.literal("likert"),
    points: z
      .number()
      .int("Número de puntos inválido")
      .min(LIKERT_MIN_POINTS)
      .max(LIKERT_MAX_POINTS),
    minLabel: text(40).optional(),
    maxLabel: text(40).optional(),
  }),
  /** Recomendación 0–10 (la pregunta del NPS) suelta, sin puntuación de instrumento. */
  z.object({ ...base, type: z.literal("nps") }),
]);

export const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("questions"),
    id: idSchema,
    questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS_PER_BLOCK),
  }),
  z.object({
    kind: z.literal("instrument"),
    /** También es el prefijo de los ids de los ítems (`${id}_1`, …). */
    id: idSchema,
    instrumentId: z.enum(INSTRUMENT_IDS),
    /** Frase nominal completa que sustituye a «{subject}» (p. ej. «esta tienda en línea»). */
    subject: text(80).optional(),
    required: z.boolean(),
  }),
]);

export const surveyConfigSchema = z
  .object({
    version: z.literal(1),
    title: text(160),
    intro: text(2000).optional(),
    blocks: z
      .array(blockSchema)
      .min(1, "Agrega al menos un bloque")
      .max(MAX_BLOCKS),
  })
  .superRefine((c, ctx) => {
    const blockIds = new Set<string>();
    const itemIds = new Set<string>();
    c.blocks.forEach((b, bi) => {
      if (blockIds.has(b.id))
        ctx.addIssue({
          code: "custom",
          path: ["blocks", bi, "id"],
          message: "Bloque duplicado",
        });
      blockIds.add(b.id);
      const claim = (id: string, path: (string | number)[]) => {
        if (itemIds.has(id))
          ctx.addIssue({
            code: "custom",
            path,
            message: `Identificador «${id}» repetido`,
          });
        itemIds.add(id);
      };
      if (b.kind === "questions") {
        b.questions.forEach((q, qi) =>
          claim(q.id, ["blocks", bi, "questions", qi, "id"]),
        );
      } else {
        getInstrument(b.instrumentId).items.forEach((item) =>
          claim(instrumentItemId(b.id, item.n), ["blocks", bi, "id"]),
        );
      }
    });
  });

export type SurveyConfig = z.infer<typeof surveyConfigSchema>;
export type SurveyBlock = z.infer<typeof blockSchema>;
export type SurveyQuestion = z.infer<typeof questionSchema>;

/** Elemento respondible aplanado: lo que ve el participante y lo que se exporta. */
export type SurveyItem =
  | {
      id: string;
      blockId: string;
      label: string;
      required: boolean;
      type: "text";
    }
  | {
      id: string;
      blockId: string;
      label: string;
      required: boolean;
      type: "number";
      min?: number;
      max?: number;
    }
  | {
      id: string;
      blockId: string;
      label: string;
      required: boolean;
      type: "select" | "multiselect";
      options: string[];
    }
  | {
      id: string;
      blockId: string;
      label: string;
      required: boolean;
      type: "scale";
      min: number;
      max: number;
      instrument?: string;
    };

/** Aplana la configuración en elementos respondibles, en orden. */
export function listItems(config: SurveyConfig): SurveyItem[] {
  const out: SurveyItem[] = [];
  for (const b of config.blocks) {
    if (b.kind === "instrument") {
      const inst = getInstrument(b.instrumentId);
      const subject = b.subject ?? inst.defaultSubject;
      for (const item of inst.items) {
        out.push({
          id: instrumentItemId(b.id, item.n),
          blockId: b.id,
          label: item.text.replaceAll("{subject}", subject),
          required: b.required,
          type: "scale",
          min: inst.scale.min,
          max: inst.scale.max,
          instrument: inst.id,
        });
      }
      continue;
    }
    for (const q of b.questions) {
      const common = {
        id: q.id,
        blockId: b.id,
        label: q.prompt,
        required: q.required,
      };
      switch (q.type) {
        case "text":
          out.push({ ...common, type: "text" });
          break;
        case "number":
          out.push({ ...common, type: "number", min: q.min, max: q.max });
          break;
        case "select":
        case "multiselect":
          out.push({ ...common, type: q.type, options: q.options });
          break;
        case "likert":
          out.push({ ...common, type: "scale", min: 1, max: q.points });
          break;
        case "nps":
          out.push({ ...common, type: "scale", min: 0, max: 10 });
          break;
      }
    }
  }
  return out;
}

/** Esquema de las respuestas de un participante. Estricto: rechaza ids desconocidos. */
export function buildAnswerSchema(config: SurveyConfig) {
  const shape: Record<string, z.ZodType> = {};
  for (const item of listItems(config)) {
    let field: z.ZodType;
    switch (item.type) {
      case "text":
        field = item.required
          ? z.string().trim().min(1, "Campo obligatorio").max(MAX_TEXT_ANSWER)
          : z.string().trim().max(MAX_TEXT_ANSWER);
        break;
      case "number": {
        let n = z.number({ message: "Debe ser un número" });
        if (item.min !== undefined) n = n.min(item.min, `Mínimo ${item.min}`);
        if (item.max !== undefined) n = n.max(item.max, `Máximo ${item.max}`);
        field = n;
        break;
      }
      case "select":
        field = z.enum(item.options as [string, ...string[]], {
          message: "Elige una opción",
        });
        break;
      case "multiselect": {
        const choice = z.enum(item.options as [string, ...string[]], {
          message: "Opción inválida",
        });
        const list = z
          .array(choice, { message: "Elige al menos una opción" })
          .max(item.options.length)
          .refine((v) => new Set(v).size === v.length, "Opciones repetidas");
        field = item.required ? list.min(1, "Elige al menos una opción") : list;
        break;
      }
      case "scale":
        field = z
          .number({ message: "Elige un valor de la escala" })
          .int("Elige un valor de la escala")
          .min(item.min, "Elige un valor de la escala")
          .max(item.max, "Elige un valor de la escala");
        break;
    }
    shape[item.id] = item.required ? field : field.optional();
  }
  return z.object(shape).strict();
}

export type SurveyAnswers = Record<string, unknown>;
