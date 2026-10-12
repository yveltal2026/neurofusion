import { z } from "zod";
import { GENDER_OPTIONS, slugify, type ExtraField, type IatConfig } from "./config";

/**
 * Datos que el participante entrega antes del test. El esquema se construye a
 * partir de la configuración del estudio y lo comparten el formulario (cliente)
 * y el endpoint /start (servidor, autoritativo).
 */

export const AGE_MIN = 10;
export const AGE_MAX = 120;

export function buildParticipantSchema(config: IatConfig) {
  const shape: Record<string, z.ZodType> = {
    explicit: z.enum(["A", "B", "neutral"], { message: "Elige una opción" }),
  };
  const { participant } = config;

  if (participant.collectAge) {
    shape.age = z.number({ message: "Edad inválida" }).int("Edad inválida").min(AGE_MIN, "Edad inválida").max(AGE_MAX, "Edad inválida").optional();
  }
  if (participant.collectGender) {
    shape.gender = z.enum(GENDER_OPTIONS).optional();
  }
  for (const f of participant.extraFields) {
    let field: z.ZodType;
    if (f.type === "text") {
      field = f.required ? z.string().trim().min(1, "Campo obligatorio").max(300) : z.string().trim().max(300);
    } else if (f.type === "number") {
      let n = z.number({ message: "Debe ser un número" });
      if (f.min !== undefined) n = n.min(f.min, `Mínimo ${f.min}`);
      if (f.max !== undefined) n = n.max(f.max, `Máximo ${f.max}`);
      field = n;
    } else if (f.type === "select") {
      field = z.enum(f.options as [string, ...string[]], { message: "Elige una opción" });
    } else if (f.type === "multiselect") {
      const choice = z.enum(f.options as [string, ...string[]], { message: "Opción inválida" });
      const list = z
        .array(choice, { message: "Elige al menos una opción" })
        .max(f.options.length)
        .refine((v) => new Set(v).size === v.length, "Opciones repetidas");
      field = f.required ? list.min(1, "Elige al menos una opción") : list;
    } else {
      field = z
        .number({ message: "Elige un valor de la escala" })
        .int("Elige un valor de la escala")
        .min(1, "Elige un valor de la escala")
        .max(f.points, "Elige un valor de la escala");
    }
    shape[f.id] = f.required ? field : field.optional();
  }
  return z.object(shape).strict();
}

export type ParticipantPayload = Record<string, unknown> & { explicit: "A" | "B" | "neutral" };

/** Separa la preferencia explícita (columna propia) del resto de datos. */
export function splitParticipantPayload(payload: ParticipantPayload): {
  explicit: "A" | "B" | "neutral";
  demographics: Record<string, unknown>;
} {
  const { explicit, ...demographics } = payload;
  return { explicit, demographics };
}

/**
 * Variables categóricas de una sesión para desgloses (edad en rangos, género y
 * campos de opción única). Los textos libres y números no se segmentan.
 */
export function sessionSegments(config: IatConfig, demographics: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const age = demographics.age;
  if (typeof age === "number") out.age_range = ageRange(age);
  if (typeof demographics.gender === "string") out.gender = demographics.gender;
  for (const f of config.participant.extraFields) {
    const v = demographics[f.id];
    if (f.type === "select" && typeof v === "string") out[f.id] = v;
  }
  return out;
}

export function ageRange(age: number): string {
  if (age < 18) return "<18";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

/** Respuesta a un campo adicional, legible para la vista de una sesión. */
export function formatExtraAnswer(field: ExtraField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (field.type === "likert" && typeof value === "number") return `${value} de ${field.points}`;
  return String(value);
}

export interface ExportColumn {
  header: string;
  value: (demographics: Record<string, unknown>) => string | number | null;
}

/**
 * Columnas del CSV para los campos adicionales. Las opciones múltiples se exportan como
 * una columna 0/1 por opción (listas para analizar); el resto, una columna por campo.
 */
export function extraFieldColumns(config: IatConfig): ExportColumn[] {
  return config.participant.extraFields.flatMap((f): ExportColumn[] => {
    if (f.type !== "multiselect") {
      return [
        {
          header: f.id,
          value: (d) => {
            const v = d[f.id];
            return typeof v === "string" || typeof v === "number" ? v : null;
          },
        },
      ];
    }
    const taken = new Set<string>();
    return f.options.map((option, i) => {
      let key = slugify(option, `opcion_${i + 1}`);
      if (taken.has(key)) key = `${key}_${i + 1}`;
      taken.add(key);
      return {
        header: `${f.id}_${key}`,
        value: (d) => (Array.isArray(d[f.id]) && (d[f.id] as unknown[]).includes(option) ? 1 : 0),
      };
    });
  });
}
