import { describe, expect, it } from "vitest";
import {
  conceptStimuli,
  defaultConsentText,
  defaultIatConfig,
  dimensionSchema,
  iatConfigSchema,
  normalizeWord,
  parseWordList,
  slugify,
  toConceptInput,
  toDimensionInput,
  type IatConfig,
} from "./config";
import { EXAMPLE_DIMENSIONS, suggestWords } from "./suggestions";
import { buildDimensionPlan } from "./engine/blocks";
import { mulberry32 } from "./engine/rng";

/** Rutas de los issues de una validación fallida, p. ej. "conceptB.label". */
function issuePaths(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return r.success ? [] : (r.error?.issues ?? []).map((i) => i.path.join("."));
}

function validConfig(): IatConfig {
  return {
    ...defaultIatConfig(),
    product: "café de especialidad",
    conceptA: { label: "Marca A", stimuli: ["Marca A"] },
    conceptB: { label: "Marca B", stimuli: ["Marca B"] },
    dimensions: [
      {
        id: "confianza",
        name: "Confianza",
        positiveLabel: "Confiable",
        negativeLabel: "Poco confiable",
        positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
        negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
      },
    ],
    texts: { consent: defaultConsentText("café"), thankYou: "Gracias" },
  };
}

describe("iatConfigSchema", () => {
  it("acepta una configuración válida", () => {
    expect(iatConfigSchema.safeParse(validConfig()).success).toBe(true);
  });

  it("rechaza conceptos con el mismo nombre (sin importar mayúsculas/acentos)", () => {
    const c = validConfig();
    c.conceptB.label = "marca á";
    const r = iatConfigSchema.safeParse(c);
    expect(issuePaths(r)).toEqual(["conceptB.label"]);
  });

  it("exige entre 1 y 4 dimensiones", () => {
    const c = validConfig();
    c.dimensions = [];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["dimensions"]);
    c.dimensions = Array.from({ length: 5 }, (_, i) => ({ ...validConfig().dimensions[0], id: `d${i}` }));
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["dimensions"]);
  });

  it("exige al menos 5 palabras por polo", () => {
    const c = validConfig();
    c.dimensions[0].positiveWords = ["Uno", "Dos", "Tres", "Cuatro"];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["dimensions.0.positiveWords"]);
  });

  it("rechaza palabras repetidas dentro de una dimensión, incluso entre polos", () => {
    const c = validConfig();
    c.dimensions[0].negativeWords[0] = "seguro"; // repite «Seguro» del polo positivo
    const r = iatConfigSchema.safeParse(c);
    expect(issuePaths(r)).toEqual(["dimensions.0.negativeWords.0"]);
    expect(JSON.stringify(r.error?.issues)).toContain("repetida");
  });

  it("rechaza polos iguales", () => {
    const r = dimensionSchema.safeParse({ ...validConfig().dimensions[0], negativeLabel: "confiable" });
    expect(issuePaths(r)).toEqual(["negativeLabel"]);
  });

  it("rechaza ids de dimensión duplicados", () => {
    const c = validConfig();
    c.dimensions.push({ ...c.dimensions[0], name: "Otra" });
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["dimensions.1.id"]);
  });

  it("rechaza campos extra con id reservado o repetido", () => {
    const c = validConfig();
    c.participant.extraFields = [{ id: "age", label: "Edad", type: "number", required: false }];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["participant.extraFields.0.id"]);
    c.participant.extraFields = [
      { id: "frecuencia", label: "Frecuencia", type: "select", options: ["Diario", "Semanal"], required: true },
      { id: "frecuencia", label: "Otra", type: "text", required: false },
    ];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["participant.extraFields.1.id"]);
  });

  it("los campos select exigen al menos 2 opciones", () => {
    const c = validConfig();
    c.participant.extraFields = [{ id: "marca", label: "Marca actual", type: "select", options: ["Solo una"], required: false }];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["participant.extraFields.0.options"]);
  });

  it("acepta opción múltiple y Likert; valida opciones repetidas y rango de puntos", () => {
    const c = validConfig();
    c.participant.extraFields = [
      { id: "canales", label: "¿Dónde compras?", type: "multiselect", options: ["Tienda", "En línea", "Cafetería"], required: false },
      { id: "valor", label: "Vale lo que cuesta", type: "likert", points: 7, minLabel: "Nada de acuerdo", maxLabel: "Muy de acuerdo", required: true },
    ];
    expect(iatConfigSchema.safeParse(c).success).toBe(true);

    c.participant.extraFields = [{ id: "canales", label: "Dónde", type: "multiselect", options: ["Tienda", "tienda"], required: false }];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["participant.extraFields.0.options.1"]);

    c.participant.extraFields = [{ id: "canales", label: "Dónde", type: "multiselect", options: ["Una"], required: false }];
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["participant.extraFields.0.options"]);

    for (const points of [2, 11, 5.5]) {
      c.participant.extraFields = [{ id: "valor", label: "Valor", type: "likert", points, required: false }];
      expect(issuePaths(iatConfigSchema.safeParse(c)), `points=${points}`).toEqual(["participant.extraFields.0.points"]);
    }
  });

  it("el tema personalizado exige color hexadecimal", () => {
    const c = validConfig();
    c.theme = { mode: "custom" };
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["theme.accent"]);
    c.theme = { mode: "custom", accent: "#12ab34" };
    expect(iatConfigSchema.safeParse(c).success).toBe(true);
    c.theme = { mode: "custom", accent: "rojo" };
    expect(issuePaths(iatConfigSchema.safeParse(c))).toEqual(["theme.accent"]);
  });
});

describe("helpers", () => {
  it("normalizeWord ignora acentos y mayúsculas", () => {
    expect(normalizeWord("  Sólido ")).toBe("solido");
  });
  it("parseWordList acepta líneas, comas y punto y coma", () => {
    expect(parseWordList("uno, dos\ntres;  cuatro\n\n")).toEqual(["uno", "dos", "tres", "cuatro"]);
  });
  it("slugify genera ids seguros", () => {
    expect(slugify("¿Marca actual?", "x")).toBe("marca_actual");
    expect(slugify("¡¡", "campo_1")).toBe("campo_1");
  });
  it("conceptStimuli usa el nombre si no hay estímulos propios", () => {
    expect(conceptStimuli({ label: " Marca A ", stimuli: [] })).toEqual(["Marca A"]);
    expect(conceptStimuli({ label: "A", stimuli: ["Logo A", " Producto A "] })).toEqual(["Logo A", "Producto A"]);
  });
});

describe("sugerencias de palabras", () => {
  it("devuelve null para pares desconocidos", () => {
    expect(suggestWords("Alegre", "Triste")).toBeNull();
    expect(suggestWords("", "")).toBeNull();
  });

  it("cada ejemplo con sugerencia produce una dimensión válida", () => {
    let found = 0;
    for (const ex of EXAMPLE_DIMENSIONS) {
      const s = suggestWords(ex.positiveLabel, ex.negativeLabel);
      if (!s) continue;
      found++;
      const r = dimensionSchema.safeParse({ id: "x", ...ex, ...s });
      expect(r.success, `${ex.name}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
    expect(found).toBe(EXAMPLE_DIMENSIONS.length);
  });

  it("coincide sin importar acentos y mayúsculas", () => {
    expect(suggestWords("CONFIABLE", "poco confiable")).not.toBeNull();
    expect(suggestWords("Económico", "Premium")).toBeNull(); // orden invertido: no hay set
  });
});

describe("integración con el motor", () => {
  it("una configuración válida genera un plan completo de 200 ensayos por dimensión", () => {
    const c = validConfig();
    const blocks = buildDimensionPlan({
      protocol: c.protocol,
      conceptA: toConceptInput(c.conceptA),
      conceptB: toConceptInput(c.conceptB),
      dimension: toDimensionInput(c.dimensions[0]),
      combo: "A_with_P1",
      rng: mulberry32(3),
    });
    expect(blocks.reduce((n, b) => n + b.trials.length, 0)).toBe(200);
    expect(blocks[0].trials[0].text).toMatch(/Marca [AB]/);
  });
});
