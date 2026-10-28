// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PredictedEyeMetrics } from "./predicted-eye-metrics";
import { AiReading } from "./asset-panels";
import { pieceAiSchema } from "../analysis/piece";
import {
  PREDICTION_EXPOSURE_MS,
  PREDICTION_VERSION,
} from "../analysis/prediction";
import type { Aoi } from "../engine/aoi";

const aoi: Aoi = {
  id: "E1",
  label: "Marca",
  kind: "logo",
  box: [0.1, 0.1, 0.3, 0.3],
  attention: 0.8,
  importance: 5,
  order: 1,
};
const raw = () => ({
  summary: "Lectura",
  message: "Mensaje",
  firstSeconds: "Marca",
  elements: [
    {
      id: "E1",
      label: "Marca",
      kind: "logo",
      box2d: [100, 100, 300, 300],
      attention: 4,
      importance: 5,
      order: 1,
      eyeMetrics: {
        ttffMs: 300,
        fixationCount: 3,
        meanFixationDurationMs: 200,
        dwellTimeMs: 800,
        hitRatePct: 75,
        firstFixationPct: 35,
        visitCount: 2,
        rationale: "Marca grande y de alto contraste.",
      },
    },
  ],
  criteria: Object.fromEntries(
    ["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map(
      (key) => [key, { score: 3, evidence: "Evidencia visible" }],
    ),
  ),
  issues: [
    {
      severity: "high",
      elementId: "E1",
      problem: "Marca pequeña",
      recommendation: "Agrandar logotipo",
    },
  ],
  strengths: ["Producto bien aislado"],
  limitations: [],
  predictionContext: {
    source: "ai_prediction_unvalidated",
    exposureMs: PREDICTION_EXPOSURE_MS,
    version: PREDICTION_VERSION,
  },
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("muestra cada KPI por AOI con su advertencia visible y valores calculados", () => {
  render(
    <PredictedEyeMetrics
      result={pieceAiSchema.parse(raw())}
      aois={[aoi]}
      analyzedAois={[aoi]}
    />,
  );
  expect(screen.getByText("IA · no medido · no validado")).toBeTruthy();
  expect(screen.getByText(/Escenario hipotético de 5 segundos/)).toBeTruthy();
  const row = screen.getByRole("rowheader", { name: /Marca/ }).closest("tr")!;
  expect(
    within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["300", "3", "200", "600", "800", "75", "35", "2", "1"]);
});

it("deja vacías las estimaciones de áreas editadas y de análisis antiguos", () => {
  const result = pieceAiSchema.parse(raw());
  const { rerender } = render(
    <PredictedEyeMetrics
      result={result}
      aois={[{ ...aoi, box: [0, 0, 1, 1] }]}
      analyzedAois={[aoi]}
    />,
  );
  expect(
    screen.getByText(/área modificada, sin predicción vigente/),
  ).toBeTruthy();
  expect(
    screen.getAllByRole("cell").every((cell) => cell.textContent === "—"),
  ).toBe(true);
  const old = raw();
  delete (old.elements[0] as { eyeMetrics?: unknown }).eyeMetrics;
  rerender(
    <PredictedEyeMetrics
      result={pieceAiSchema.parse(old)}
      aois={[aoi]}
      analyzedAois={[aoi]}
    />,
  );
  expect(screen.getByText(/requiere nuevo análisis/)).toBeTruthy();
});

it("exporta la identidad de la imagen, el escenario y la advertencia como parte de los datos", async () => {
  let exported: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      exported = blob;
      return "blob:test";
    },
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <PredictedEyeMetrics
      result={pieceAiSchema.parse(raw())}
      aois={[aoi]}
      analyzedAois={[aoi]}
      asset={{ id: "image-1", title: "=imagen" }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Descargar predicciones por AOI CSV" }),
  );
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(exported!);
  });
  expect(content).toContain(
    "image-1,'=imagen,ai_prediction_unvalidated,ai-eye-scenario-v1,5000,predicted,E1,logo,Marca,300,3,200,600,800,75,35,2,1",
  );
});

it("presenta aciertos y debilidades con prioridad y recomendación por imagen", () => {
  render(
    <AiReading
      result={pieceAiSchema.parse(raw())}
      aois={[aoi]}
      analyzedAois={[aoi]}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Aciertos principales" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Debilidades principales" }),
  ).toBeTruthy();
  expect(screen.getByText("Producto bien aislado")).toBeTruthy();
  expect(screen.getAllByText("Marca pequeña").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Agrandar logotipo/).length).toBeGreaterThan(0);
});
