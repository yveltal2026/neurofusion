import { describe, expect, it } from "vitest";
import {
  pieceAiSchema,
  pieceVisionSchema,
  mergeMissingElements,
  visionReviewSchema,
} from "./piece";
import {
  aoiPredictions,
  predictedEyeMetricsSchema,
  PREDICTION_EXPOSURE_MS,
  PREDICTION_VERSION,
} from "./prediction";
import { primaryFindings } from "./findings";
import type { Aoi } from "../engine/aoi";

const metrics = {
  ttffMs: 300,
  fixationCount: 3,
  meanFixationDurationMs: 200,
  dwellTimeMs: 800,
  hitRatePct: 75,
  firstFixationPct: 35,
  visitCount: 2,
  rationale:
    "Marca grande y de alto contraste; hipótesis para exposición breve.",
};
const element = {
  id: "E1",
  label: "Marca",
  kind: "logo",
  box2d: [100, 100, 300, 300],
  attention: 4,
  importance: 5,
  order: 1,
  eyeMetrics: metrics,
};
const raw = () => ({
  summary: "Resumen",
  message: "Mensaje",
  firstSeconds: "Marca",
  elements: [element],
  criteria: Object.fromEntries(
    ["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map(
      (key) => [key, { score: 3, evidence: "Evidencia visible" }],
    ),
  ),
  issues: [],
  strengths: [],
  limitations: [],
  predictionContext: {
    source: "ai_prediction_unvalidated",
    version: PREDICTION_VERSION,
    exposureMs: PREDICTION_EXPOSURE_MS,
  },
});
const aoi: Aoi = {
  id: "E1",
  label: "Marca",
  kind: "logo",
  box: [0.1, 0.1, 0.3, 0.3],
  attention: 0.8,
  importance: 5,
  order: 1,
};

describe("proyecciones numéricas de IA", () => {
  it("acepta un escenario coherente y calcula TFD y regresos de sus componentes", () => {
    const result = pieceVisionSchema.parse(raw());
    const rows = aoiPredictions(result, [aoi], [aoi]);
    expect(rows[0]).toMatchObject({
      status: "predicted",
      totalFixationDurationMs: 600,
      revisitCount: 1,
      prediction: metrics,
    });
  });
  it("conserva análisis anteriores sin inventar números y exige predicciones a nuevas generaciones", () => {
    const legacy = {
      ...raw(),
      predictionContext: undefined,
      elements: [{ ...element, eyeMetrics: undefined }],
    };
    const parsed = pieceAiSchema.parse(legacy);
    expect(aoiPredictions(parsed, [aoi], [aoi])[0]).toMatchObject({
      status: "legacy",
      prediction: null,
      totalFixationDurationMs: null,
    });
    expect(pieceVisionSchema.safeParse(legacy).success).toBe(false);
  });
  it("no reutiliza valores cuando cambian la caja, el tipo o el identificador de una AOI", () => {
    const parsed = pieceAiSchema.parse(raw());
    for (const changed of [
      { ...aoi, box: [0.2, 0.1, 0.5, 0.3] as Aoi["box"] },
      { ...aoi, kind: "cta" as const },
      { ...aoi, id: "new" },
    ]) {
      expect(aoiPredictions(parsed, [changed], [aoi])[0]).toMatchObject({
        status: "edited",
        prediction: null,
      });
    }
    expect(
      aoiPredictions(parsed, [{ ...aoi, label: "Marca renombrada" }], [aoi])[0]
        .prediction,
    ).toEqual(metrics);
  });
  it("valida ausencia de fijaciones como nulos y ceros distintos", () => {
    const zero = {
      ...metrics,
      fixationCount: 0,
      ttffMs: null,
      meanFixationDurationMs: null,
      dwellTimeMs: 0,
      visitCount: 0,
      hitRatePct: 0,
      firstFixationPct: 0,
    };
    expect(predictedEyeMetricsSchema.safeParse(zero).success).toBe(true);
    expect(
      predictedEyeMetricsSchema.safeParse({ ...zero, ttffMs: 0 }).success,
    ).toBe(false);
  });
  it("rechaza contradicciones y valores que exceden cinco segundos", () => {
    for (const invalid of [
      { ...metrics, dwellTimeMs: 500 },
      { ...metrics, ttffMs: 4500 },
      { ...metrics, firstFixationPct: 90 },
      { ...metrics, visitCount: 4 },
      { ...metrics, meanFixationDurationMs: null },
      { ...metrics, hitRatePct: 0 },
      { ...metrics, fixationCount: 1.5 },
    ]) {
      expect(predictedEyeMetricsSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      pieceVisionSchema.safeParse({ ...raw(), elements: [element, element] })
        .success,
    ).toBe(false);
  });
  it("la revisión de elementos mantiene predicciones al reasignar IDs", () => {
    const result = pieceVisionSchema.parse(raw());
    const review = visionReviewSchema.parse({
      missing: [{ ...element, id: "E90", box2d: [600, 600, 900, 900] }],
    });
    const merged = mergeMissingElements(result, review.missing);
    expect(merged.elements[1].id).toBe("E2");
    expect(merged.elements[1].eyeMetrics).toEqual(metrics);
    expect(
      visionReviewSchema.safeParse({
        missing: [{ ...element, eyeMetrics: undefined }],
      }).success,
    ).toBe(false);
  });
});

describe("aciertos y debilidades por imagen", () => {
  it("prioriza problemas altos y usa criterios bajos o zonas ciegas como evidencia adicional", () => {
    const result = pieceAiSchema.parse({
      ...raw(),
      issues: [
        {
          severity: "low",
          elementId: null,
          problem: "Margen reducido",
          recommendation: "Ampliar margen",
        },
        {
          severity: "high",
          elementId: "E1",
          problem: "Marca ilegible",
          recommendation: "Aumentar contraste",
        },
      ],
      strengths: ["Producto bien aislado"],
    });
    result.criteria.cta = { score: 1, evidence: "No hay llamado a la acción" };
    result.criteria.brand = { score: 1, evidence: "La marca se pierde" };
    const report = primaryFindings(result, [aoi]);
    expect(report.strengths).toEqual(["Producto bien aislado"]);
    expect(report.weaknesses[0].problem).toBe("Marca ilegible");
    expect(
      report.weaknesses.some((w) => w.problem.startsWith("Presencia de marca")),
    ).toBe(false);
    expect(report.weaknesses[1].problem).toContain(
      "No hay llamado a la acción",
    );
  });
  it("no inventa aciertos ni defectos si no hay evidencia y conserva las listas originales", () => {
    const result = pieceAiSchema.parse(raw());
    expect(primaryFindings(result, []).strengths).toEqual([]);
    expect(primaryFindings(result, []).weaknesses).toEqual([]);
    result.criteria.brand = { score: 5, evidence: "Logotipo visible" };
    expect(primaryFindings(result, []).strengths[0]).toContain(
      "Logotipo visible",
    );
    expect(
      primaryFindings(result, [{ ...aoi, attention: 0.2 }]).weaknesses[0]
        .problem,
    ).toContain("Marca");
    expect(result.issues).toEqual([]);
  });
});
