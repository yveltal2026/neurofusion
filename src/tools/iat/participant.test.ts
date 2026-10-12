import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "./config";
import { ageRange, buildParticipantSchema, extraFieldColumns, formatExtraAnswer, sessionSegments, splitParticipantPayload } from "./participant";

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

describe("opción múltiple y Likert", () => {
  const config = cfg({
    extraFields: [
      { id: "canales", label: "Dónde compras", type: "multiselect", options: ["Tienda", "En línea", "Cafetería"], required: true },
      { id: "extras", label: "Extras", type: "multiselect", options: ["Leche", "Azúcar"], required: false },
      { id: "valor", label: "Vale lo que cuesta", type: "likert", points: 5, minLabel: "Nada", maxLabel: "Mucho", required: true },
      { id: "recompra", label: "Volvería a comprar", type: "likert", points: 7, required: false },
    ],
  });
  const schema = buildParticipantSchema(config);
  const base = { explicit: "A" as const, canales: ["Tienda", "En línea"], valor: 4 };

  it("acepta varias opciones, ninguna en las opcionales y valores dentro de la escala", () => {
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, extras: [], recompra: 7 }).success).toBe(true);
    expect(schema.safeParse({ ...base, extras: ["Leche", "Azúcar"], recompra: 1 }).success).toBe(true);
  });

  it("rechaza opciones inexistentes o repetidas y la lista vacía si es obligatoria", () => {
    expect(schema.safeParse({ ...base, canales: ["Kiosco"] }).success).toBe(false);
    expect(schema.safeParse({ ...base, canales: ["Tienda", "Tienda"] }).success).toBe(false);
    expect(schema.safeParse({ ...base, canales: [] }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", valor: 3 }).success).toBe(false); // falta la múltiple obligatoria
    expect(schema.safeParse({ ...base, canales: "Tienda" }).success).toBe(false); // debe ser lista
  });

  it("Likert: entero entre 1 y los puntos de la escala", () => {
    for (const bad of [0, 6, 2.5, "3", null]) expect(schema.safeParse({ ...base, valor: bad }).success, String(bad)).toBe(false);
    expect(schema.safeParse({ ...base, recompra: 8 }).success).toBe(false);
    expect(schema.safeParse({ explicit: "A", canales: ["Tienda"] }).success).toBe(false); // falta Likert obligatoria
  });

  it("no segmenta por opción múltiple ni Likert", () => {
    expect(sessionSegments(config, { canales: ["Tienda"], valor: 4 })).toEqual({});
  });

  it("formatExtraAnswer: listas, escala y vacíos", () => {
    const [canales, , valor] = config.participant.extraFields;
    expect(formatExtraAnswer(canales, ["Tienda", "En línea"])).toBe("Tienda, En línea");
    expect(formatExtraAnswer(canales, [])).toBe("—");
    expect(formatExtraAnswer(valor, 4)).toBe("4 de 5");
    expect(formatExtraAnswer(valor, undefined)).toBe("—");
  });

  it("extraFieldColumns: una columna 0/1 por opción y una por Likert", () => {
    const cols = extraFieldColumns(config);
    expect(cols.map((c) => c.header)).toEqual(["canales_tienda", "canales_en_linea", "canales_cafeteria", "extras_leche", "extras_azucar", "valor", "recompra"]);
    const demo = { canales: ["En línea"], valor: 4 };
    expect(cols.map((c) => c.value(demo))).toEqual([0, 1, 0, 0, 0, 4, null]);
  });

  it("extraFieldColumns: opciones que producen el mismo identificador no chocan", () => {
    const c = cfg({ extraFields: [{ id: "m", label: "M", type: "multiselect", options: ["Café!", "Café?"], required: false }] });
    const headers = extraFieldColumns(c).map((x) => x.header);
    expect(new Set(headers).size).toBe(2);
  });
});
