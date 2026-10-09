import { normalizeWord } from "./config";

/**
 * Sugerencias curadas de palabras estímulo para pares de polos frecuentes.
 * 5 palabras por polo, de intensidad emocional comparable dentro de cada polo
 * (criterio de la skill iat-study-builder). Funcionan sin IA y sin conexión;
 * en una fase posterior se complementan con sugerencias generadas por IA.
 */
interface WordSet {
  /** Etiquetas (normalizadas) que activan esta sugerencia, polo positivo y negativo. */
  positive: string[];
  negative: string[];
  positiveWords: string[];
  negativeWords: string[];
}

const SETS: WordSet[] = [
  {
    positive: ["bueno", "agradable", "positivo", "bien"],
    negative: ["malo", "desagradable", "negativo", "mal"],
    positiveWords: ["Excelente", "Agradable", "Genial", "Maravilloso", "Placentero"],
    negativeWords: ["Terrible", "Desagradable", "Horrible", "Molesto", "Pésimo"],
  },
  {
    positive: ["confiable", "seguro", "fiable"],
    negative: ["poco confiable", "inseguro", "no confiable", "dudoso"],
    positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
    negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
  },
  {
    positive: ["premium", "exclusivo", "lujo"],
    negative: ["economico", "barato", "basico"],
    positiveWords: ["Elegante", "Exclusivo", "Refinado", "Distinguido", "Lujoso"],
    negativeWords: ["Barato", "Simple", "Común", "Básico", "Corriente"],
  },
  {
    positive: ["innovador", "moderno", "vanguardista"],
    negative: ["anticuado", "tradicional", "obsoleto"],
    positiveWords: ["Moderno", "Novedoso", "Creativo", "Vanguardista", "Original"],
    negativeWords: ["Anticuado", "Obsoleto", "Pasado", "Rutinario", "Atrasado"],
  },
  {
    positive: ["calidad", "alta calidad", "buena calidad"],
    negative: ["baja calidad", "mala calidad", "mediocre"],
    positiveWords: ["Duradero", "Impecable", "Resistente", "Superior", "Sobresaliente"],
    negativeWords: ["Deficiente", "Defectuoso", "Endeble", "Inferior", "Mediocre"],
  },
  {
    positive: ["saludable", "sano", "natural"],
    negative: ["no saludable", "danino", "artificial", "nocivo"],
    positiveWords: ["Nutritivo", "Sano", "Natural", "Fresco", "Vital"],
    negativeWords: ["Nocivo", "Artificial", "Tóxico", "Procesado", "Dañino"],
  },
];

export interface WordSuggestion {
  positiveWords: string[];
  negativeWords: string[];
}

/** Busca una sugerencia curada para los polos dados; null si no hay coincidencia. */
export function suggestWords(positiveLabel: string, negativeLabel: string): WordSuggestion | null {
  const pos = normalizeWord(positiveLabel);
  const neg = normalizeWord(negativeLabel);
  if (!pos || !neg) return null;
  const match = SETS.find((s) => s.positive.includes(pos) && s.negative.includes(neg));
  return match ? { positiveWords: [...match.positiveWords], negativeWords: [...match.negativeWords] } : null;
}

/** Pares de polos de ejemplo para inspirar al investigador en el paso de dimensiones. */
export const EXAMPLE_DIMENSIONS: { name: string; positiveLabel: string; negativeLabel: string }[] = [
  { name: "Valoración general", positiveLabel: "Bueno", negativeLabel: "Malo" },
  { name: "Confianza", positiveLabel: "Confiable", negativeLabel: "Poco confiable" },
  { name: "Posicionamiento", positiveLabel: "Premium", negativeLabel: "Económico" },
  { name: "Innovación", positiveLabel: "Innovador", negativeLabel: "Anticuado" },
];
