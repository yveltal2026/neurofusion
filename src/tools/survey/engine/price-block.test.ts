import { describe, expect, it } from "vitest";
import { addPriceBlock, buildConfig, emptyDraft, parsePrices, setTitle, updateBlock } from "../builder/model";
import { computeSurveyAggregates, type SurveyResponse } from "./aggregate";
import { GG_NO, GG_YES } from "./price";
import { blockInstructions, buildAnswerSchema, listItems, surveyConfigSchema, type SurveyConfig } from "./schema";

const base = { version: 1, title: "Precio", texts: { consent: "c", thankYou: "t" } };

function vwConfig(): SurveyConfig {
  return surveyConfigSchema.parse({ ...base, blocks: [{ kind: "price", id: "vw", method: "van_westendorp", subject: "esta suscripción", required: true }] });
}
function ggConfig(): SurveyConfig {
  return surveyConfigSchema.parse({ ...base, blocks: [{ kind: "price", id: "gg", method: "gabor_granger", prices: [100, 200, 300], currency: "MXN", required: true }] });
}

describe("bloque de precio · esquema", () => {
  it("Van Westendorp genera cuatro ítems numéricos con el sujeto sustituido", () => {
    const items = listItems(vwConfig());
    expect(items.map((i) => i.id)).toEqual(["vw_1", "vw_2", "vw_3", "vw_4"]);
    expect(items.every((i) => i.type === "number")).toBe(true);
    expect(items[0]!.label).toContain("esta suscripción");
    // La moneda va como unidad junto al campo, no dentro del enunciado.
    expect(items[0]).toMatchObject({ type: "number", unit: "MXN" });
    expect(items[0]!.label).not.toContain("MXN");
  });

  it("cada bloque de precio explica qué responder y en qué unidad", () => {
    const vw = vwConfig().blocks[0]!;
    expect(blockInstructions(vw)).toMatch(/cuatro preguntas/);
    expect(blockInstructions(vw)).toMatch(/en MXN/);
    expect(blockInstructions(vw)).toMatch(/de la más baja a la más alta/);
    const gg = ggConfig().blocks[0]!;
    expect(blockInstructions(gg)).toMatch(/3 precios posibles/);
    expect(blockInstructions(gg)).toMatch(/precio real/);
  });

  it("Gabor-Granger genera un ítem sí/no por precio", () => {
    const items = listItems(ggConfig());
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ id: "gg_2", type: "select", options: [GG_YES, GG_NO] });
    expect(items[1]!.label).toContain("200");
  });

  it("Gabor-Granger exige al menos 3 precios distintos", () => {
    const bad = (prices: number[]) =>
      surveyConfigSchema.safeParse({ ...base, blocks: [{ kind: "price", id: "gg", method: "gabor_granger", prices, required: true }] });
    expect(bad([100, 200]).success).toBe(false);
    expect(bad([100, 100, 200]).success).toBe(false);
    expect(bad([100, 200, 300]).success).toBe(true);
  });

  it("detecta identificadores repetidos entre bloques", () => {
    const r = surveyConfigSchema.safeParse({
      ...base,
      blocks: [
        { kind: "price", id: "vw", method: "van_westendorp", required: true },
        { kind: "questions", id: "q", questions: [{ id: "vw_1", type: "text", prompt: "x", required: false }] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("valida respuestas con el mismo esquema de ítems", () => {
    const schema = buildAnswerSchema(vwConfig());
    expect(schema.safeParse({ vw_1: 50, vw_2: 80, vw_3: 150, vw_4: 250 }).success).toBe(true);
    expect(schema.safeParse({ vw_1: -5, vw_2: 80, vw_3: 150, vw_4: 250 }).success).toBe(false);
    const gg = buildAnswerSchema(ggConfig());
    expect(gg.safeParse({ gg_1: "Sí", gg_2: "No", gg_3: "No" }).success).toBe(true);
    expect(gg.safeParse({ gg_1: "Quizá", gg_2: "No", gg_3: "No" }).success).toBe(false);
  });
});

describe("bloque de precio · agregados", () => {
  const resp = (id: string, answers: Record<string, unknown>): SurveyResponse => ({ id, answers });

  it("Van Westendorp usa sólo respuestas completas y excluye las incoherentes", () => {
    const cfg = vwConfig();
    const r = computeSurveyAggregates(cfg, [
      resp("1", { vw_1: 5, vw_2: 10, vw_3: 20, vw_4: 30 }),
      resp("2", { vw_1: 10, vw_2: 15, vw_3: 25, vw_4: 40 }),
      resp("3", { vw_1: 30, vw_2: 20, vw_3: 10, vw_4: 5 }), // incoherente
    ]);
    const agg = r.prices[0]!;
    expect(agg.method).toBe("van_westendorp");
    if (agg.method !== "van_westendorp") throw new Error("método inesperado");
    expect(agg.result.n).toBe(2);
    expect(agg.result.nExcluded).toBe(1);
    expect(agg.result.pmc).toBeCloseTo(12.5, 10);
  });

  it("Gabor-Granger convierte Sí/No en demanda y encuentra el precio óptimo", () => {
    const cfg = ggConfig();
    const rows: SurveyResponse[] = [];
    // 10 personas: 8 compran a 100, 5 a 200, 2 a 300 → ingresos 80 / 100 / 60 por cada 100 personas
    for (let i = 0; i < 10; i++) {
      const k = i < 2 ? 3 : i < 5 ? 2 : i < 8 ? 1 : 0;
      rows.push(resp(String(i), { gg_1: k >= 1 ? GG_YES : GG_NO, gg_2: k >= 2 ? GG_YES : GG_NO, gg_3: k >= 3 ? GG_YES : GG_NO }));
    }
    const agg = computeSurveyAggregates(cfg, rows).prices[0]!;
    if (agg.method !== "gabor_granger") throw new Error("método inesperado");
    expect(agg.result.points.map((p) => p.share)).toEqual([0.8, 0.5, 0.2]);
    expect(agg.result.optimalPrice).toBe(200);
  });

  it("no mezcla los ítems de precio con las preguntas sueltas", () => {
    expect(computeSurveyAggregates(vwConfig(), []).items).toEqual([]);
    expect(computeSurveyAggregates(ggConfig(), []).items).toEqual([]);
  });

  it("una respuesta incompleta no entra a Van Westendorp", () => {
    const r = computeSurveyAggregates(vwConfig(), [resp("1", { vw_1: 5, vw_2: 10 })]);
    const agg = r.prices[0]!;
    expect(agg.result.n).toBe(0);
  });

  it("las respuestas excluidas manualmente no cuentan", () => {
    const r = computeSurveyAggregates(vwConfig(), [{ id: "1", excluded: true, answers: { vw_1: 5, vw_2: 10, vw_3: 20, vw_4: 30 } }]);
    expect(r.prices[0]!.result.n).toBe(0);
  });
});

describe("bloque de precio · constructor", () => {
  it("parsePrices acepta comas, espacios y saltos de línea", () => {
    expect(parsePrices("100, 150\n200 250;300")).toEqual([100, 150, 200, 250, 300]);
    expect(parsePrices("99.5")).toEqual([99.5]);
  });

  it("construye una configuración válida y ordena los precios", () => {
    let d = setTitle(emptyDraft(), "Mi estudio de precio");
    d = addPriceBlock(d, "gabor_granger");
    d = updateBlock(d, "gg", { pricesText: "300, 100, 200" });
    const built = buildConfig(d);
    expect(built.ok).toBe(true);
    if (built.ok) {
      const b = built.config.blocks[0]!;
      expect(b.kind === "price" && b.prices).toEqual([100, 200, 300]);
    }
  });

  it("explica en lenguaje del investigador qué falta", () => {
    let d = setTitle(emptyDraft(), "Mi estudio");
    d = addPriceBlock(d, "gabor_granger");
    d = updateBlock(d, "gg", { pricesText: "100, 200" });
    const built = buildConfig(d);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.join(" ")).toMatch(/Gabor-Granger.*al menos 3 precios/);
  });

  it("Van Westendorp no necesita precios", () => {
    let d = setTitle(emptyDraft(), "Mi estudio");
    d = addPriceBlock(d, "van_westendorp");
    expect(buildConfig(d).ok).toBe(true);
  });

  it("dos bloques del mismo método reciben ids distintos", () => {
    let d = addPriceBlock(emptyDraft(), "van_westendorp");
    d = addPriceBlock(d, "van_westendorp");
    expect(new Set(d.blocks.map((b) => b.id)).size).toBe(2);
  });
});
