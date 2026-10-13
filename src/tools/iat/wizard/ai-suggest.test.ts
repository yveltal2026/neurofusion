import { describe, expect, it } from "vitest";
import type { AnalysisProvider, CompletionRequest } from "@/lib/ai/types";
import { dimensionSchema, iatConfigSchema, defaultIatConfig, defaultConsentText } from "../config";
import {
  MAX_BRIEF_CHARS,
  MIN_BRIEF_CHARS,
  SUGGEST_SYSTEM_PROMPT,
  aiSuggestionSchema,
  briefSchema,
  buildSuggestPrompt,
  suggestDesign,
  suggestionToConfigPatch,
} from "./ai-suggest";

const dim = (name: string, pos: string, neg: string, p: string[], n: string[]) => ({
  name,
  positiveLabel: pos,
  negativeLabel: neg,
  positiveWords: p,
  negativeWords: n,
});

const confianza = dim("Confianza", "Confiable", "Poco confiable", ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"], ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"]);
const calidad = dim("Calidad", "Alta calidad", "Baja calidad", ["Duradero", "Impecable", "Resistente", "Superior", "Sobresaliente"], ["Deficiente", "Defectuoso", "Endeble", "Inferior", "Mediocre"]);

const valid = {
  product: "café de especialidad",
  concepts: { a: "Starbucks", b: "Punta del Cielo" },
  dimensions: [confianza, calidad],
  notes: "Se eligieron dimensiones de confianza y calidad percibida.",
};

function fakeProvider(replies: string[]): AnalysisProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    name: "anthropic",
    model: "fake",
    calls,
    async complete(req) {
      calls.push(structuredClone(req));
      return { text: replies[calls.length - 1] ?? "", model: "fake-model" };
    },
  };
}

describe("briefSchema", () => {
  it("exige una descripción corta pero suficiente", () => {
    expect(briefSchema.safeParse("muy corto").success).toBe(false);
    expect(briefSchema.safeParse("  " + "a".repeat(MIN_BRIEF_CHARS) + "  ").success).toBe(true);
    expect(briefSchema.safeParse("a".repeat(MAX_BRIEF_CHARS + 1)).success).toBe(false);
  });
});

describe("aiSuggestionSchema", () => {
  it("acepta una propuesta válida y concepts null", () => {
    expect(aiSuggestionSchema.safeParse(valid).success).toBe(true);
    expect(aiSuggestionSchema.safeParse({ ...valid, concepts: null }).success).toBe(true);
    expect(aiSuggestionSchema.parse({ product: "x", dimensions: [confianza] }).concepts).toBeNull();
  });

  it("aplica las mismas reglas que el servidor: 5–10 palabras, sin repetidas, polos distintos", () => {
    const short = { ...valid, dimensions: [{ ...confianza, positiveWords: ["Seguro", "Honesto"] }] };
    expect(aiSuggestionSchema.safeParse(short).success).toBe(false);
    const repeated = { ...valid, dimensions: [{ ...confianza, negativeWords: ["seguro", "Engañoso", "Frágil", "Inestable", "Dudoso"] }] };
    expect(aiSuggestionSchema.safeParse(repeated).success).toBe(false);
    const samePole = { ...valid, dimensions: [{ ...confianza, negativeLabel: "confiable" }] };
    expect(aiSuggestionSchema.safeParse(samePole).success).toBe(false);
  });

  it("limita a 4 dimensiones, sin nombres repetidos y con conceptos distintos", () => {
    expect(aiSuggestionSchema.safeParse({ ...valid, dimensions: Array(5).fill(confianza) }).success).toBe(false);
    expect(aiSuggestionSchema.safeParse({ ...valid, dimensions: [confianza, { ...calidad, name: "confianza" }] }).success).toBe(false);
    expect(aiSuggestionSchema.safeParse({ ...valid, concepts: { a: "Marca", b: "marca" } }).success).toBe(false);
    expect(aiSuggestionSchema.safeParse({ ...valid, dimensions: [] }).success).toBe(false);
  });
});

describe("suggestionToConfigPatch", () => {
  it("asigna ids únicos y produce dimensiones que pasan la validación del servidor", () => {
    const s = aiSuggestionSchema.parse({ ...valid, dimensions: [confianza, { ...calidad, name: "Confianza " + "!" }] });
    const patch = suggestionToConfigPatch(s);
    expect(patch.dimensions.map((d) => d.id)).toEqual(["confianza", "confianza_2"]);
    for (const d of patch.dimensions) expect(dimensionSchema.safeParse(d).success).toBe(true);
    expect(patch.conceptA).toEqual({ label: "Starbucks", stimuli: ["Starbucks"] });
  });

  it("sin conceptos no toca los conceptos y el resultado completa una configuración válida", () => {
    const patch = suggestionToConfigPatch(aiSuggestionSchema.parse({ ...valid, concepts: null }));
    expect(patch.conceptA).toBeUndefined();
    const config = {
      ...defaultIatConfig(),
      ...patch,
      conceptA: { label: "A", stimuli: ["A"] },
      conceptB: { label: "B", stimuli: ["B"] },
      texts: { consent: defaultConsentText(patch.product), thankYou: "Gracias" },
    };
    expect(iatConfigSchema.safeParse(config).success).toBe(true);
  });
});

describe("suggestDesign", () => {
  it("manda la descripción al modelo y devuelve la propuesta validada", async () => {
    const p = fakeProvider(["```json\n" + JSON.stringify(valid) + "\n```"]);
    const r = await suggestDesign(p, "Quiero comparar Starbucks con Punta del Cielo");
    expect(r.suggestion.dimensions).toHaveLength(2);
    expect(p.calls[0].system).toBe(SUGGEST_SYSTEM_PROMPT);
    expect(p.calls[0].messages[0].content).toContain("Quiero comparar Starbucks con Punta del Cielo");
  });

  it("si la primera respuesta incumple las reglas, pide una corrección", async () => {
    const bad = { ...valid, dimensions: [{ ...confianza, positiveWords: ["Seguro"] }] };
    const p = fakeProvider([JSON.stringify(bad), JSON.stringify(valid)]);
    const r = await suggestDesign(p, "descripción suficientemente larga");
    expect(r.suggestion.product).toBe("café de especialidad");
    expect(p.calls).toHaveLength(2);
    expect(p.calls[1].messages[2].content).toContain("positiveWords");
  });

  it("el prompt sigue el criterio de la skill", () => {
    expect(SUGGEST_SYSTEM_PROMPT).toContain("2-3 dimensiones");
    expect(SUGGEST_SYSTEM_PROMPT).toContain("intensidad emocional comparable");
    expect(SUGGEST_SYSTEM_PROMPT).toContain("Nunca inventes marcas");
    expect(buildSuggestPrompt("hola")).toContain('"""\nhola\n"""');
  });
});
