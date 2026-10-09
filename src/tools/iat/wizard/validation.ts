import { z } from "zod";
import {
  conceptSchema,
  dimensionBaseSchema,
  dimensionSchema,
  iatConfigSchema,
  normalizeWord,
  participantSchema,
  themeSchema,
  type IatConfig,
} from "../config";

export type WizardStepId =
  | "product"
  | "concepts"
  | "dimensions"
  | "words"
  | "protocol"
  | "participant"
  | "theme"
  | "confirm";

export const WIZARD_STEPS: { id: WizardStepId; title: string }[] = [
  { id: "product", title: "Producto o categoría" },
  { id: "concepts", title: "Conceptos a comparar" },
  { id: "dimensions", title: "Dimensiones" },
  { id: "words", title: "Palabras estímulo" },
  { id: "protocol", title: "Rigor del protocolo" },
  { id: "participant", title: "Datos del participante" },
  { id: "theme", title: "Identidad visual" },
  { id: "confirm", title: "Confirmación" },
];

const productSchema = z.string().trim().min(1, "Escribe el producto, servicio o categoría").max(120, "Máximo 120 caracteres");

function messages(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => i.message))];
}

/** Errores (en español) que impiden avanzar desde el paso dado. Vacío = válido. */
export function validateStep(step: WizardStepId, c: IatConfig): string[] {
  switch (step) {
    case "product": {
      const r = productSchema.safeParse(c.product);
      return r.success ? [] : messages(r.error);
    }
    case "concepts": {
      const errors: string[] = [];
      for (const [key, concept] of [
        ["A", c.conceptA],
        ["B", c.conceptB],
      ] as const) {
        const r = conceptSchema.safeParse(concept);
        if (!r.success) errors.push(...messages(r.error).map((m) => `Concepto ${key}: ${m}`));
      }
      if (c.conceptA.label.trim() && normalizeWord(c.conceptA.label) === normalizeWord(c.conceptB.label)) {
        errors.push("Los dos conceptos deben tener nombres distintos");
      }
      return errors;
    }
    case "dimensions": {
      if (c.dimensions.length === 0) return ["Agrega al menos una dimensión"];
      const errors: string[] = [];
      c.dimensions.forEach((d, i) => {
        const r = dimensionBaseSchema.pick({ name: true, positiveLabel: true, negativeLabel: true }).safeParse(d);
        if (!r.success) errors.push(...messages(r.error).map((m) => `Dimensión ${i + 1}: ${m}`));
        else if (normalizeWord(d.positiveLabel) === normalizeWord(d.negativeLabel)) {
          errors.push(`Dimensión ${i + 1}: los dos polos deben ser distintos`);
        }
      });
      return errors;
    }
    case "words": {
      const errors: string[] = [];
      c.dimensions.forEach((d, i) => {
        const r = dimensionSchema.safeParse(d);
        if (!r.success) errors.push(...messages(r.error).map((m) => `«${d.name || `Dimensión ${i + 1}`}»: ${m}`));
      });
      return errors;
    }
    case "protocol":
      return [];
    case "participant": {
      const r = participantSchema.safeParse(c.participant);
      return r.success ? [] : messages(r.error);
    }
    case "theme": {
      const r = themeSchema.safeParse(c.theme);
      if (!r.success) return messages(r.error);
      return c.theme.mode === "custom" && !c.theme.accent ? ["Elige un color"] : [];
    }
    case "confirm": {
      const r = iatConfigSchema.safeParse(c);
      return r.success ? [] : messages(r.error);
    }
  }
}
