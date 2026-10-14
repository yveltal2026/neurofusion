import {
  defaultConsentText,
  DEFAULT_THANK_YOU,
  getInstrument,
  surveyConfigSchema,
  type InstrumentId,
  type PriceMethod,
  type SurveyConfig,
  type SurveyQuestion,
} from "../engine";

/**
 * Modelo del constructor de encuestas: estado editable (con campos de texto planos, aptos
 * para formularios) y funciones puras para modificarlo y convertirlo en la configuración que
 * valida el motor. Sin React ni I/O.
 */

export type QuestionType = SurveyQuestion["type"];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  select: "Opción única",
  multiselect: "Opción múltiple",
  likert: "Escala (Likert)",
  nps: "Recomendación 0–10",
  number: "Número",
  text: "Texto libre",
};

export interface DraftQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  /** Una opción por línea (opción única y múltiple). */
  optionsText: string;
  points: number;
  minLabel: string;
  maxLabel: string;
  min: string;
  max: string;
}

export type DraftBlock =
  | { kind: "questions"; id: string; questions: DraftQuestion[] }
  | {
      kind: "instrument";
      id: string;
      instrumentId: InstrumentId;
      subject: string;
      required: boolean;
    }
  | {
      kind: "price";
      id: string;
      method: PriceMethod;
      subject: string;
      currency: string;
      /** Precios a probar, separados por comas o saltos de línea (sólo Gabor-Granger). */
      pricesText: string;
      required: boolean;
    };

export interface SurveyDraft {
  /** Nombre interno del estudio (lo ve el investigador). */
  name: string;
  /** Título que ve el participante. */
  title: string;
  intro: string;
  consent: string;
  /** Si el investigador editó el consentimiento, deja de regenerarse al cambiar el título. */
  consentEdited: boolean;
  thankYou: string;
  blocks: DraftBlock[];
  /** Contador para ids únicos que no se reutilizan al borrar. */
  counter: number;
}

export function emptyDraft(): SurveyDraft {
  return {
    name: "",
    title: "",
    intro: "",
    consent: defaultConsentText(""),
    consentEdited: false,
    thankYou: DEFAULT_THANK_YOU,
    blocks: [],
    counter: 0,
  };
}

// ----------------------------------------------------------------- ids

function nextCounter(d: SurveyDraft): [SurveyDraft, number] {
  return [{ ...d, counter: d.counter + 1 }, d.counter + 1];
}

// ----------------------------------------------------------------- fábricas

export function newQuestion(type: QuestionType, id: string): DraftQuestion {
  return {
    id,
    type,
    prompt: "",
    required: true,
    optionsText:
      type === "select" || type === "multiselect" ? "Opción 1\nOpción 2" : "",
    points: 5,
    minLabel: "",
    maxLabel: "",
    min: "",
    max: "",
  };
}

export function addQuestionsBlock(d: SurveyDraft): SurveyDraft {
  const [next, n] = nextCounter(d);
  return {
    ...next,
    blocks: [...next.blocks, { kind: "questions", id: `b${n}`, questions: [] }],
  };
}

export function addInstrumentBlock(
  d: SurveyDraft,
  instrumentId: InstrumentId,
): SurveyDraft {
  const [next, n] = nextCounter(d);
  // El id del bloque es el prefijo de sus ítems: legible en el CSV (p. ej. sus_1, nps_1).
  const taken = new Set(next.blocks.map((b) => b.id));
  let id: string = instrumentId;
  if (taken.has(id)) id = `${instrumentId}${n}`;
  return {
    ...next,
    blocks: [
      ...next.blocks,
      { kind: "instrument", id, instrumentId, subject: "", required: true },
    ],
  };
}

export function addPriceBlock(d: SurveyDraft, method: PriceMethod): SurveyDraft {
  const [next, n] = nextCounter(d);
  const base = method === "van_westendorp" ? "vw" : "gg";
  const taken = new Set(next.blocks.map((b) => b.id));
  const id = taken.has(base) ? `${base}${n}` : base;
  return {
    ...next,
    blocks: [
      ...next.blocks,
      {
        kind: "price",
        id,
        method,
        subject: "",
        currency: "MXN",
        pricesText: method === "gabor_granger" ? "100, 150, 200, 250, 300" : "",
        required: true,
      },
    ],
  };
}

/** Lista de precios escrita como texto: números separados por comas, punto y coma, espacios o saltos de línea (decimales con punto). */
export function parsePrices(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => Number(t));
}

export function addQuestion(
  d: SurveyDraft,
  blockId: string,
  type: QuestionType,
): SurveyDraft {
  const [next, n] = nextCounter(d);
  return {
    ...next,
    blocks: next.blocks.map((b) =>
      b.kind === "questions" && b.id === blockId
        ? { ...b, questions: [...b.questions, newQuestion(type, `p${n}`)] }
        : b,
    ),
  };
}

// ----------------------------------------------------------------- edición

export function updateBlock(
  d: SurveyDraft,
  blockId: string,
  patch:
    | Partial<Extract<DraftBlock, { kind: "instrument" }>>
    | Partial<Extract<DraftBlock, { kind: "price" }>>,
): SurveyDraft {
  return {
    ...d,
    blocks: d.blocks.map((b) =>
      b.id === blockId && b.kind !== "questions"
        ? ({ ...b, ...patch } as DraftBlock)
        : b,
    ),
  };
}

export function updateQuestion(
  d: SurveyDraft,
  blockId: string,
  questionId: string,
  patch: Partial<DraftQuestion>,
): SurveyDraft {
  return {
    ...d,
    blocks: d.blocks.map((b) =>
      b.kind === "questions" && b.id === blockId
        ? {
            ...b,
            questions: b.questions.map((q) =>
              q.id === questionId ? { ...q, ...patch } : q,
            ),
          }
        : b,
    ),
  };
}

export function removeBlock(d: SurveyDraft, blockId: string): SurveyDraft {
  return { ...d, blocks: d.blocks.filter((b) => b.id !== blockId) };
}

export function removeQuestion(
  d: SurveyDraft,
  blockId: string,
  questionId: string,
): SurveyDraft {
  return {
    ...d,
    blocks: d.blocks.map((b) =>
      b.kind === "questions" && b.id === blockId
        ? { ...b, questions: b.questions.filter((q) => q.id !== questionId) }
        : b,
    ),
  };
}

/** Mueve un elemento una posición (−1 arriba, +1 abajo). Fuera de rango no hace nada. */
export function moveItem<T>(
  list: readonly T[],
  index: number,
  delta: -1 | 1,
): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length)
    return [...list];
  const out = [...list];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

export function moveBlock(
  d: SurveyDraft,
  blockId: string,
  delta: -1 | 1,
): SurveyDraft {
  return {
    ...d,
    blocks: moveItem(
      d.blocks,
      d.blocks.findIndex((b) => b.id === blockId),
      delta,
    ),
  };
}

export function moveQuestion(
  d: SurveyDraft,
  blockId: string,
  questionId: string,
  delta: -1 | 1,
): SurveyDraft {
  return {
    ...d,
    blocks: d.blocks.map((b) =>
      b.kind === "questions" && b.id === blockId
        ? {
            ...b,
            questions: moveItem(
              b.questions,
              b.questions.findIndex((q) => q.id === questionId),
              delta,
            ),
          }
        : b,
    ),
  };
}

/** Cambia el título; mientras el consentimiento no se haya editado a mano, lo regenera con el título. */
export function setTitle(d: SurveyDraft, title: string): SurveyDraft {
  return {
    ...d,
    title,
    consent: d.consentEdited ? d.consent : defaultConsentText(title.trim()),
  };
}

export function setConsent(d: SurveyDraft, consent: string): SurveyDraft {
  return { ...d, consent, consentEdited: true };
}

// ----------------------------------------------------------------- plantillas

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  build: () => SurveyDraft;
}

function withBlocks(
  title: string,
  build: (d: SurveyDraft) => SurveyDraft,
): SurveyDraft {
  return build(setTitle({ ...emptyDraft(), name: title }, title));
}

export const TEMPLATES: SurveyTemplate[] = [
  {
    id: "blank",
    name: "En blanco",
    description: "Empieza sin bloques y arma tu propia encuesta.",
    build: () => emptyDraft(),
  },
  {
    id: "usability",
    name: "Usabilidad de un sitio o app",
    description:
      "Escala de usabilidad (SUS), recomendación (NPS) y una pregunta abierta.",
    build: () =>
      withBlocks("Usabilidad", (d0) => {
        let d = addInstrumentBlock(d0, "sus");
        d = addInstrumentBlock(d, "nps");
        d = addQuestionsBlock(d);
        const block = d.blocks[d.blocks.length - 1]!;
        d = addQuestion(d, block.id, "text");
        const q = (
          d.blocks[d.blocks.length - 1] as Extract<
            DraftBlock,
            { kind: "questions" }
          >
        ).questions[0]!;
        return updateQuestion(d, block.id, q.id, {
          prompt: "¿Qué mejorarías de esta experiencia?",
          required: false,
        });
      }),
  },
  {
    id: "brand",
    name: "Percepción de una marca o anuncio",
    description: "Actitud hacia la marca, intención de compra y recomendación.",
    build: () =>
      withBlocks("Percepción de marca", (d0) => {
        let d = addInstrumentBlock(d0, "attitude");
        d = addInstrumentBlock(d, "purchase_intent");
        return addInstrumentBlock(d, "nps");
      }),
  },
  {
    id: "emotion",
    name: "Reacción emocional ante un estímulo",
    description:
      "Valencia, activación y dominancia (SAM) más una pregunta de interés.",
    build: () =>
      withBlocks("Reacción emocional", (d0) => {
        let d = addInstrumentBlock(d0, "sam");
        d = addQuestionsBlock(d);
        const block = d.blocks[d.blocks.length - 1]!;
        d = addQuestion(d, block.id, "likert");
        const q = (
          d.blocks[d.blocks.length - 1] as Extract<
            DraftBlock,
            { kind: "questions" }
          >
        ).questions[0]!;
        return updateQuestion(d, block.id, q.id, {
          prompt: "¿Qué tan interesante te pareció?",
          minLabel: "Nada interesante",
          maxLabel: "Muy interesante",
        });
      }),
  },
];

// ----------------------------------------------------------------- conversión a configuración

function toQuestion(q: DraftQuestion): unknown {
  const base = { id: q.id, prompt: q.prompt.trim(), required: q.required };
  const optional = (s: string) => (s.trim() === "" ? undefined : s.trim());
  switch (q.type) {
    case "select":
    case "multiselect":
      return {
        ...base,
        type: q.type,
        options: q.optionsText
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean),
      };
    case "likert":
      return {
        ...base,
        type: "likert",
        points: q.points,
        minLabel: optional(q.minLabel),
        maxLabel: optional(q.maxLabel),
      };
    case "number": {
      const num = (s: string) =>
        s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s);
      return { ...base, type: "number", min: num(q.min), max: num(q.max) };
    }
    case "text":
    case "nps":
      return { ...base, type: q.type };
  }
}

function toBlock(b: DraftBlock): unknown {
  if (b.kind === "price") {
    return {
      kind: "price",
      id: b.id,
      method: b.method,
      subject: b.subject.trim() || undefined,
      currency: b.currency.trim() || undefined,
      prices: b.method === "gabor_granger" ? parsePrices(b.pricesText).sort((a, c) => a - c) : undefined,
      required: b.required,
    };
  }
  if (b.kind === "instrument") {
    return {
      kind: "instrument",
      id: b.id,
      instrumentId: b.instrumentId,
      subject: b.subject.trim() || undefined,
      required: b.required,
    };
  }
  return {
    kind: "questions",
    id: b.id,
    questions: b.questions.map(toQuestion),
  };
}

export type BuildResult =
  { ok: true; config: SurveyConfig } | { ok: false; errors: string[] };

/** Ubica un error del esquema en lenguaje del investigador («Bloque 2 · pregunta 1: …»). */
function describeIssue(
  d: SurveyDraft,
  path: readonly PropertyKey[],
  message: string,
): string {
  if (path[0] !== "blocks" || typeof path[1] !== "number") {
    const field =
      path[0] === "title"
        ? "Título"
        : path[0] === "intro"
          ? "Introducción"
          : path[0] === "texts"
            ? path[1] === "consent"
              ? "Consentimiento"
              : "Texto de cierre"
            : null;
    return field ? `${field}: ${message}` : message;
  }
  const block = d.blocks[path[1]];
  const where = [`Bloque ${path[1] + 1}`];
  if (block?.kind === "instrument")
    where.push(getInstrument(block.instrumentId).name);
  if (block?.kind === "price")
    where.push(block.method === "van_westendorp" ? "Van Westendorp" : "Gabor-Granger");
  if (path[2] === "questions" && typeof path[3] === "number")
    where.push(`pregunta ${path[3] + 1}`);
  return `${where.join(" · ")}: ${message}`;
}

/** Convierte el borrador en la configuración validada del motor, o lista lo que falta corregir. */
export function buildConfig(d: SurveyDraft): BuildResult {
  const parsed = surveyConfigSchema.safeParse({
    version: 1,
    title: d.title.trim(),
    intro: d.intro.trim() || undefined,
    texts: { consent: d.consent.trim(), thankYou: d.thankYou.trim() },
    blocks: d.blocks.map(toBlock),
  });
  if (parsed.success) return { ok: true, config: parsed.data };
  const errors: string[] = [];
  for (const issue of parsed.error.issues) {
    const text = describeIssue(d, issue.path, issue.message);
    if (!errors.includes(text)) errors.push(text);
  }
  return { ok: false, errors };
}
