import { z } from "zod";
import { GG_NO, GG_YES, MAX_GG_PRICES, MIN_GG_PRICES, PRICE_METHODS, VW_QUESTIONS } from "./price";
import {
  INSTRUMENT_IDS,
  getInstrument,
  instrumentItemId,
  type InstrumentDef,
  type InstrumentItem,
} from "./instruments";

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
  z
    .object({
      kind: z.literal("price"),
      /** Prefijo de los ítems (`${id}_1`, …). */
      id: idSchema,
      method: z.enum(PRICE_METHODS),
      /** Frase nominal completa que sustituye a «{subject}» (p. ej. «esta suscripción»). */
      subject: text(80).optional(),
      /** Moneda que se muestra junto al precio (p. ej. «MXN»). */
      currency: text(8).optional(),
      /** Precios a probar (sólo Gabor-Granger). */
      prices: z.array(z.number().positive("El precio debe ser mayor a 0").max(1e9)).max(MAX_GG_PRICES).optional(),
      required: z.boolean(),
    })
    .superRefine((b, ctx) => {
      if (b.method !== "gabor_granger") return;
      const prices = b.prices ?? [];
      if (prices.length < MIN_GG_PRICES)
        ctx.addIssue({ code: "custom", path: ["prices"], message: `Agrega al menos ${MIN_GG_PRICES} precios para probar` });
      if (new Set(prices).size !== prices.length)
        ctx.addIssue({ code: "custom", path: ["prices"], message: "Hay precios repetidos" });
    }),
]);

/** Identificador del ítem n (1..) de un bloque de precio. */
export const priceItemId = (blockId: string, n: number) => `${blockId}_${n}`;

/** Cantidad de ítems de un bloque de precio. */
export function priceItemCount(b: Extract<z.infer<typeof blockSchema>, { kind: "price" }>): number {
  return b.method === "van_westendorp" ? VW_QUESTIONS.length : (b.prices?.length ?? 0);
}

/** Texto de consentimiento por defecto; el investigador puede editarlo antes de publicar. */
export function defaultConsentText(title: string): string {
  return [
    `Estás invitado(a) a participar en una encuesta: «${title || "encuesta"}».`,
    "Te pediremos responder algunas preguntas. Dura pocos minutos.",
    "Tu participación es voluntaria y confidencial: no te pedimos nombre ni correo, y tus respuestas se analizan de forma agregada con fines de investigación.",
    "Puedes abandonar la encuesta en cualquier momento cerrando esta ventana. Al continuar confirmas que tienes 18 años o más y que aceptas participar.",
  ].join("\n\n");
}

export const DEFAULT_THANK_YOU =
  "¡Gracias por participar! Tus respuestas se han registrado correctamente. Ya puedes cerrar esta ventana.";

export const surveyConfigSchema = z
  .object({
    version: z.literal(1),
    title: text(160),
    intro: text(2000).optional(),
    texts: z.object({ consent: text(4000), thankYou: text(1000) }),
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
      } else if (b.kind === "price") {
        for (let n = 1; n <= priceItemCount(b); n++) claim(priceItemId(b.id, n), ["blocks", bi, "id"]);
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
      /** Unidad que se muestra junto al campo (p. ej. la moneda de un precio). */
      unit?: string;
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
      /** Etiquetas de los extremos (escala numérica). */
      minLabel?: string;
      maxLabel?: string;
      /** Una etiqueta por punto, de `min` a `max` (escala con todas las opciones rotuladas). */
      labels?: string[];
    };

/** Etiquetas de escala de un ítem de instrumento, según cómo se presente el instrumento. */
function scaleLabelsOf(
  inst: InstrumentDef,
  item: InstrumentItem,
): { minLabel?: string; maxLabel?: string; labels?: string[] } {
  if (inst.scaleDisplay === "labeled") return { labels: inst.scaleLabels };
  return {
    minLabel: item.minLabel ?? inst.scaleLabels?.[0],
    maxLabel: item.maxLabel ?? inst.scaleLabels?.at(-1),
  };
}

/** Elementos respondibles de un bloque de precio (cuatro de Van Westendorp o uno por precio de Gabor-Granger). */
export function listPriceItems(
  b: Extract<z.infer<typeof blockSchema>, { kind: "price" }>,
): SurveyItem[] {
  const subject = b.subject ?? "este producto";
  const currency = b.currency ?? "MXN";
  if (b.method === "van_westendorp")
    return VW_QUESTIONS.map((q, i) => ({
      id: priceItemId(b.id, i + 1),
      blockId: b.id,
      label: q.text.replaceAll("{subject}", subject),
      required: b.required,
      type: "number" as const,
      min: 0,
      unit: currency,
    }));
  return (b.prices ?? []).map((price, i) => ({
    id: priceItemId(b.id, i + 1),
    blockId: b.id,
    label: `Si ${subject} costara ${price} ${currency}, ¿lo comprarías?`,
    required: b.required,
    type: "select" as const,
    options: [GG_YES, GG_NO],
  }));
}

/** Aplana la configuración en elementos respondibles, en orden. */
export function listItems(config: SurveyConfig): SurveyItem[] {
  const out: SurveyItem[] = [];
  for (const b of config.blocks) {
    if (b.kind === "price") {
      out.push(...listPriceItems(b));
      continue;
    }
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
          ...scaleLabelsOf(inst, item),
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
          out.push({
            ...common,
            type: "scale",
            min: 1,
            max: q.points,
            minLabel: q.minLabel,
            maxLabel: q.maxLabel,
          });
          break;
        case "nps":
          out.push({
            ...common,
            type: "scale",
            min: 0,
            max: 10,
            minLabel: "Nada probable",
            maxLabel: "Muy probable",
          });
          break;
      }
    }
  }
  return out;
}

/** Esquema de la respuesta a un elemento (opcional si el elemento no es obligatorio). */
function itemSchema(item: SurveyItem): z.ZodType {
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
  return item.required ? field : field.optional();
}

/** Esquema de las respuestas de un participante. Estricto: rechaza ids desconocidos. */
export function buildAnswerSchema(config: SurveyConfig) {
  const shape: Record<string, z.ZodType> = {};
  for (const item of listItems(config)) shape[item.id] = itemSchema(item);
  return z.object(shape).strict();
}

/** Elementos de un bloque, en orden. */
export function itemsOfBlock(
  config: SurveyConfig,
  blockId: string,
): SurveyItem[] {
  return listItems(config).filter((it) => it.blockId === blockId);
}

/** Indicación del instrumento de un bloque (si la tiene), para mostrarla encima de sus ítems. */
export function blockInstructions(block: SurveyBlock): string | undefined {
  if (block.kind === "instrument")
    return getInstrument(block.instrumentId).instructions;
  if (block.kind === "price") return priceInstructions(block);
  return undefined;
}

/**
 * Indicación que abre un bloque de precio: qué se pide, en qué unidad y qué significa la cifra que
 * se ve en pantalla. El participante la lee solo, sin instructor.
 */
export function priceInstructions(
  b: Extract<SurveyBlock, { kind: "price" }>,
): string {
  const subject = b.subject ?? "este producto";
  const currency = b.currency ?? "MXN";
  if (b.method === "van_westendorp")
    return `Imagina que estás pensando en comprar ${subject}. Te haremos cuatro preguntas sobre cuánto pagarías. En cada una escribe sólo un número, en ${currency}. Tus cuatro respuestas deben ir de la más baja a la más alta. No hay respuestas correctas: queremos tu opinión.`;
  const n = b.prices?.length ?? 0;
  return `Te mostraremos ${n} precios posibles de ${subject}, uno por pregunta. Imagina que ese fuera el precio real y elige si lo comprarías o no. No hay respuestas correctas: queremos tu opinión.`;
}

/**
 * Agrupa elementos de escala consecutivos que comparten enunciado y escala y sólo difieren en los polos
 * (diferencial semántico: «Mi opinión sobre X es: mala … buena»). Cada grupo se muestra con el
 * enunciado una vez y una fila por polo. Los demás elementos quedan solos.
 */
export function groupBipolar(items: readonly SurveyItem[]): SurveyItem[][] {
  const groups: SurveyItem[][] = [];
  for (const item of items) {
    const last = groups.at(-1)?.[0];
    const prev = groups.at(-1);
    const bipolar = (i: SurveyItem) =>
      i.type === "scale" && Boolean(i.minLabel) && Boolean(i.maxLabel);
    if (
      prev &&
      last &&
      bipolar(item) &&
      bipolar(last) &&
      item.type === "scale" &&
      last.type === "scale" &&
      item.label === last.label &&
      item.min === last.min &&
      item.max === last.max &&
      item.blockId === last.blockId
    )
      prev.push(item);
    else groups.push([item]);
  }
  return groups;
}

/**
 * Valida las respuestas de un conjunto de elementos (p. ej. el bloque que se está
 * viendo) con las MISMAS reglas que el servidor. Devuelve un mensaje por elemento con
 * error, vacío si todo está bien. Un elemento sin responder se trata como tal, no como
 * un tipo inválido.
 */
export function validateItems(
  items: readonly SurveyItem[],
  answers: SurveyAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of items) {
    const value = answers[item.id];
    const empty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (item.required)
        errors[item.id] =
          item.type === "text" || item.type === "number"
            ? "Campo obligatorio"
            : "Responde esta pregunta";
      continue;
    }
    const parsed = itemSchema(item).safeParse(value);
    if (!parsed.success)
      errors[item.id] = parsed.error.issues[0]?.message ?? "Respuesta inválida";
  }
  return errors;
}

export type SurveyAnswers = Record<string, unknown>;
