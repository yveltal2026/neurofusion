import { z } from "zod";
import { GENDER_OPTIONS, type IatConfig } from "./config";

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
    } else {
      field = z.enum(f.options as [string, ...string[]], { message: "Elige una opción" });
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
