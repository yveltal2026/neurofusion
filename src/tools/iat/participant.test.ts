import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "./config";
import { ageRange, buildParticipantSchema, sessionSegments, splitParticipantPayload } from "./participant";

function cfg(over: Partial<IatConfig["participant"]> = {}): IatConfig {
  return {
    ...defaultIatConfig(),
    product: "café",
    conceptA: { label: "A", stimuli: ["A"] },
    conceptB: { label: "B", stimuli: ["B"] },
    dimensions: [],
    texts: { consent: defaultConsentText("café"), thankYou: "Gracias" },
    participant: {
      collectAge: true,
      collectGender: true,
      explicitQuestion: "¿Cuál prefieres?",
      extraFields: [
        { id: "frecuencia", label: "Frecuencia", type: "select", options: ["Diario", "Semanal"], required: true },
        { id: "gasto", label: "Gasto", type: "number", min: 0, max: 1000, required: false },
        { id: "nota", label: "Nota", type: "text", required: false },
      ],
      ...over,
    },
  };
}

describe("buildParticipantSchema", () => {
  const schema = buildParticipantSchema(cfg());

  it("acepta un payload completo y uno mínimo", () => {
    expect(schema.safeParse({ explicit: "A", age: 30, gender: "Mujer", frecuencia: "Diario", gasto: 50, nota: "ok" }).success).toBe(true);
    expect(schema.safeParse({ explicit: "neutral", frecuencia: "Semanal" }).success).toBe(true);
  });

  it("la preferencia explícita es obligatoria y sólo A/B/neutral", () => {
    expect(schema.safeParse({ frecuencia: "Diario" }).success).toBe(false);
    expect(schema.safeParse({ explicit: "C", frecuencia: "Diario" }).success).toBe(false);
  });

  it("valida rangos, opciones y obligatorios", () => {
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", age: 5 }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", age: 200 }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", age: 30.5 }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", frecuencia: "Nunca" }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A" }).success).toBe(false); // falta campo obligatorio
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", gasto: 5000 }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", gender: "Otro" }).success).toBe(false);
  });

  it("rechaza claves no declaradas (no se cuelan datos arbitrarios)", () => {
    expect(schema.safeParse({ explicit: "A", frecuencia: "Diario", isAdmin: true }).success).toBe(false);
  });

  it("sin edad/género configurados esas claves no se aceptan", () => {
    const s = buildParticipantSchema(cfg({ collectAge: false, collectGender: false, extraFields: [] }));
    expect(s.safeParse({ explicit: "B" }).success).toBe(true);
    expect(s.safeParse({ explicit: "B", age: 30 }).success).toBe(false);
  });
});

describe("splitParticipantPayload / sessionSegments", () => {
  it("separa explícita de demográficos", () => {
    expect(splitParticipantPayload({ explicit: "B", age: 30, frecuencia: "Diario" })).toEqual({
      explicit: "B",
      demographics: { age: 30, frecuencia: "Diario" },
    });
  });

  it("segmenta edad en rangos, género y campos de opción única", () => {
    expect(sessionSegments(cfg(), { age: 29, gender: "Hombre", frecuencia: "Semanal", gasto: 20, nota: "x" })).toEqual({
      age_range: "25-34",
      gender: "Hombre",
      frecuencia: "Semanal",
    });
    expect(sessionSegments(cfg(), {})).toEqual({});
  });

  it.each([
    [17, "<18"],
    [18, "18-24"],
    [24, "18-24"],
    [25, "25-34"],
    [44, "35-44"],
    [54, "45-54"],
    [55, "55+"],
    [99, "55+"],
  ])("ageRange(%i) = %s", (age, range) => expect(ageRange(age)).toBe(range));
});
