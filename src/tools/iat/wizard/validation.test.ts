import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { validateStep, WIZARD_STEPS } from "./validation";

function filled(): IatConfig {
  return {
    ...defaultIatConfig(),
    product: "café",
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

describe("validateStep", () => {
  it("todos los pasos pasan con una configuración completa", () => {
    for (const s of WIZARD_STEPS) expect(validateStep(s.id, filled()), s.id).toEqual([]);
  });

  it("producto vacío bloquea el paso 1 y sólo ése", () => {
    const c = { ...filled(), product: "  " };
    expect(validateStep("product", c)).toEqual(["Escribe el producto, servicio o categoría"]);
    expect(validateStep("concepts", c)).toEqual([]);
  });

  it("conceptos: falta nombre o nombres iguales", () => {
    const c = filled();
    c.conceptA = { label: "", stimuli: [""] };
    expect(validateStep("concepts", c).length).toBeGreaterThan(0);
    const same = filled();
    same.conceptB = { label: "marca a", stimuli: ["marca a"] };
    expect(validateStep("concepts", same)).toEqual(["Los dos conceptos deben tener nombres distintos"]);
  });

  it("dimensiones: sin dimensiones y polos iguales", () => {
    const none = { ...filled(), dimensions: [] };
    expect(validateStep("dimensions", none)).toEqual(["Agrega al menos una dimensión"]);
    const same = filled();
    same.dimensions[0].negativeLabel = "Confiable";
    expect(validateStep("dimensions", same)).toEqual(["Dimensión 1: los dos polos deben ser distintos"]);
  });

  it("dimensiones no exige palabras todavía; el paso de palabras sí", () => {
    const c = filled();
    c.dimensions[0].positiveWords = [];
    expect(validateStep("dimensions", c)).toEqual([]);
    const errs = validateStep("words", c);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("Confianza");
    expect(errs[0]).toContain("Mínimo 5 palabras por polo");
  });

  it("palabras repetidas se reportan con el nombre de la dimensión", () => {
    const c = filled();
    c.dimensions[0].negativeWords[1] = "honesto";
    const errs = validateStep("words", c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("repetida");
  });

  it("tema personalizado sin color bloquea", () => {
    const c = { ...filled(), theme: { mode: "custom" as const } };
    expect(validateStep("theme", c)).toEqual(["Elige un color"]);
  });

  it("confirmación exige textos", () => {
    const c = { ...filled(), texts: { consent: "", thankYou: "" } };
    expect(validateStep("confirm", c).length).toBeGreaterThan(0);
  });
});
