/**
 * Biblioteca de instrumentos estandarizados. Cada instrumento lleva su fuente,
 * su versión y la escala de sus ítems; la puntuación vive en `scoring.ts` y es
 * código puro. Los textos con `{subject}` se completan con una frase nominal
 * completa (p. ej. «esta tienda en línea»), así no hay problemas de género.
 *
 * Las traducciones al español son TEXTOS DE TRABAJO: no cuentan con validación
 * psicométrica propia. Antes de publicar resultados como instrumento validado,
 * conviene cotejarlas con una versión validada en español para la población.
 */

export const INSTRUMENT_IDS = [
  "sus",
  "nps",
  "sam",
  "purchase_intent",
  "attitude",
] as const;
export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export interface InstrumentItem {
  /** Posición 1..n dentro del instrumento (forma el id: `${bloque}_${n}`). */
  n: number;
  text: string;
  /** Ítem redactado en sentido inverso a la dirección del puntaje. */
  reverse?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

export interface InstrumentDef {
  id: InstrumentId;
  /** Versión del texto y de la puntuación; cambia si se altera cualquiera. */
  version: string;
  name: string;
  /** Mínimo y máximo (enteros) de cada ítem. */
  scale: { min: number; max: number };
  /** Etiquetas de cada punto de la escala, si todos los ítems comparten las mismas. */
  scaleLabels?: string[];
  items: InstrumentItem[];
  /**
   * Cómo se presenta la escala: `endpoints` = números con etiquetas sólo en los extremos;
   * `labeled` = una opción por cada punto, con su etiqueta completa (`scaleLabels`).
   */
  scaleDisplay: "endpoints" | "labeled";
  /** Indicación breve para el participante, sin revelar el nombre del instrumento. */
  instructions?: string;
  defaultSubject: string;
  source: string;
  notes: string;
}

const AGREEMENT_LABELS = [
  "Totalmente en desacuerdo",
  "En desacuerdo",
  "Ni de acuerdo ni en desacuerdo",
  "De acuerdo",
  "Totalmente de acuerdo",
];

const SUS: InstrumentDef = {
  id: "sus",
  scaleDisplay: "endpoints",
  instructions: "Indica qué tan de acuerdo estás con cada afirmación.",
  version: "sus-es-1.0",
  name: "Escala de Usabilidad del Sistema (SUS)",
  scale: { min: 1, max: 5 },
  scaleLabels: AGREEMENT_LABELS,
  defaultSubject: "este sistema",
  items: [
    { n: 1, text: "Creo que me gustaría usar {subject} con frecuencia." },
    {
      n: 2,
      text: "Me pareció innecesariamente complejo usar {subject}.",
      reverse: true,
    },
    { n: 3, text: "Me pareció fácil usar {subject}." },
    {
      n: 4,
      text: "Creo que necesitaría el apoyo de una persona técnica para poder usar {subject}.",
      reverse: true,
    },
    {
      n: 5,
      text: "Las diversas funciones de {subject} me parecieron bien integradas.",
    },
    {
      n: 6,
      text: "Me pareció que había demasiada inconsistencia en {subject}.",
      reverse: true,
    },
    {
      n: 7,
      text: "Imagino que la mayoría de las personas aprendería a usar {subject} muy rápido.",
    },
    { n: 8, text: "Me resultó muy incómodo usar {subject}.", reverse: true },
    { n: 9, text: "Sentí mucha confianza al usar {subject}." },
    {
      n: 10,
      text: "Necesité aprender muchas cosas antes de poder empezar a usar {subject}.",
      reverse: true,
    },
  ],
  source:
    "Brooke, J. (1996). SUS: a “quick and dirty” usability scale. En Usability Evaluation in Industry.",
  notes:
    "Puntaje 0–100, no es un porcentaje. Traducción de trabajo sin validación psicométrica en español.",
};

const NPS: InstrumentDef = {
  id: "nps",
  scaleDisplay: "endpoints",
  version: "nps-es-1.0",
  name: "Net Promoter Score (NPS)",
  scale: { min: 0, max: 10 },
  defaultSubject: "esta marca",
  items: [
    {
      n: 1,
      text: "¿Qué tan probable es que recomiendes {subject} a un amigo o colega?",
      minLabel: "Nada probable",
      maxLabel: "Muy probable",
    },
  ],
  source:
    "Reichheld, F. F. (2003). The one number you need to grow. Harvard Business Review, 81(12).",
  notes:
    "Promotores 9–10, pasivos 7–8, detractores 0–6. El NPS es %promotores − %detractores (−100 a 100).",
};

const SAM: InstrumentDef = {
  id: "sam",
  scaleDisplay: "endpoints",
  instructions: "Elige el número que mejor describa cómo te sentiste.",
  version: "sam-es-1.0",
  name: "Maniquí de autoevaluación (SAM): valencia, activación y dominancia",
  scale: { min: 1, max: 9 },
  defaultSubject: "esto",
  items: [
    {
      n: 1,
      text: "¿Cómo te hizo sentir {subject}?",
      minLabel: "Infeliz",
      maxLabel: "Feliz",
    },
    {
      n: 2,
      text: "¿Qué nivel de energía te provocó {subject}?",
      minLabel: "Calmado",
      maxLabel: "Excitado",
    },
    {
      n: 3,
      text: "¿Qué tanto control sentiste frente a {subject}?",
      minLabel: "Sin control",
      maxLabel: "En control",
    },
  ],
  source:
    "Bradley, M. M., & Lang, P. J. (1994). Measuring emotion: the Self-Assessment Manikin. Journal of Behavior Therapy and Experimental Psychiatry, 25(1).",
  notes:
    "Aquí se aplica en versión numérica 1–9 con etiquetas de extremos. Las figuras originales del SAM tienen derechos de uso propios: no se incluyen; si se quieren las figuras, usar las licenciadas o ilustraciones propias.",
};

const PURCHASE_INTENT: InstrumentDef = {
  id: "purchase_intent",
  scaleDisplay: "labeled",
  version: "pi-es-1.0",
  name: "Intención de compra (5 puntos)",
  scale: { min: 1, max: 5 },
  scaleLabels: [
    "Definitivamente no",
    "Probablemente no",
    "Tal vez sí, tal vez no",
    "Probablemente sí",
    "Definitivamente sí",
  ],
  defaultSubject: "este producto",
  items: [{ n: 1, text: "¿Comprarías {subject}?" }],
  source:
    "Escala de intención de compra de cinco puntos, de uso común en investigación de mercado.",
  notes:
    "La intención declarada suele sobreestimar la compra real: no es un pronóstico de ventas. Se reporta el porcentaje en las dos categorías superiores (4–5).",
};

const ATTITUDE: InstrumentDef = {
  id: "attitude",
  scaleDisplay: "endpoints",
  instructions:
    "En cada línea, toca el punto más cercano a la palabra que mejor represente tu opinión.",
  version: "att-es-1.1",
  name: "Actitud hacia la marca o el anuncio (diferencial semántico, 7 puntos)",
  scale: { min: 1, max: 7 },
  defaultSubject: "esta marca",
  items: [
    {
      n: 1,
      text: "Mi opinión general sobre {subject} es:",
      minLabel: "Mala",
      maxLabel: "Buena",
    },
    {
      n: 2,
      text: "Mi opinión general sobre {subject} es:",
      minLabel: "Desfavorable",
      maxLabel: "Favorable",
    },
    {
      n: 3,
      text: "Mi opinión general sobre {subject} es:",
      minLabel: "Desagradable",
      maxLabel: "Agradable",
    },
  ],
  source:
    "Adaptación de escalas de diferencial semántico de actitud hacia el anuncio y la marca (p. ej., Mitchell & Olson, 1981).",
  notes:
    "Puntaje = promedio de los tres ítems (1–7). Se reporta la consistencia interna (alfa de Cronbach) cuando hay muestra suficiente.",
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  sus: SUS,
  nps: NPS,
  sam: SAM,
  purchase_intent: PURCHASE_INTENT,
  attitude: ATTITUDE,
};

export function getInstrument(id: InstrumentId): InstrumentDef {
  return INSTRUMENTS[id];
}

/** Texto de un ítem con el sujeto sustituido. */
export function renderItemText(item: InstrumentItem, subject: string): string {
  return item.text.replaceAll("{subject}", subject);
}

/** Identificador de un ítem de instrumento dentro de las respuestas de la encuesta. */
export function instrumentItemId(blockId: string, n: number): string {
  return `${blockId}_${n}`;
}
