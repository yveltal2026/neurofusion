import type { IconName } from "@/components/brand/icon";
import type { InstrumentId, PriceMethod } from "../engine";
import type { QuestionType } from "./model";

/** Un icono por tipo de pregunta: se reconoce de un vistazo en el selector y en los botones de agregar. */
export const QUESTION_TYPE_ICONS: Record<QuestionType, IconName> = {
  select: "radio",
  multiselect: "checks",
  likert: "scale",
  nps: "gauge",
  number: "hash",
  text: "lines",
};

/** Nombre corto y frase de ayuda de cada instrumento (el nombre completo vive en el motor). */
export const INSTRUMENT_CATALOG: Record<
  InstrumentId,
  { short: string; blurb: string; icon: IconName }
> = {
  sus: {
    short: "Usabilidad (SUS)",
    blurb:
      "Qué tan fácil de usar le parece un sitio o app. Puntaje de 0 a 100.",
    icon: "device",
  },
  nps: {
    short: "Recomendación (NPS)",
    blurb: "Qué tan probable es que lo recomiende.",
    icon: "gauge",
  },
  sam: {
    short: "Emoción (SAM)",
    blurb: "Cómo se sintió: agrado, energía y control.",
    icon: "neuro",
  },
  purchase_intent: {
    short: "Intención de compra",
    blurb: "¿Lo compraría? De «definitivamente no» a «definitivamente sí».",
    icon: "check",
  },
  attitude: {
    short: "Actitud hacia la marca",
    blurb: "Opinión general sobre una marca o anuncio, de mala a buena.",
    icon: "eye",
  },
};

export const PRICE_CATALOG: Record<
  PriceMethod,
  { short: string; blurb: string; icon: IconName }
> = {
  van_westendorp: {
    short: "Van Westendorp",
    blurb:
      "Cuatro preguntas abiertas para hallar el rango de precio aceptable.",
    icon: "coin",
  },
  gabor_granger: {
    short: "Gabor-Granger",
    blurb: "Sí o no a cada precio que elijas, para trazar la curva de demanda.",
    icon: "coin",
  },
};
