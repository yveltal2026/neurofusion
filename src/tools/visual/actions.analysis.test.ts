import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeAsset } from "./actions";
import { planTiles } from "./engine/tiles";
import {
  PREDICTION_EXPOSURE_MS,
  PREDICTION_VERSION,
} from "./analysis/prediction";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  complete: vi.fn(),
  revalidate: vi.fn(),
  image: vi.fn(),
  contrast: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./image.server", () => ({
  imageForVision: mocks.image,
  textContrasts: mocks.contrast,
}));
vi.mock("@/lib/ai", async () => ({
  ...(await import("@/lib/ai/structured")),
  ...(await import("@/lib/ai/types")),
  getAnalysisProvider: () => ({ name: "anthropic", complete: mocks.complete }),
}));

const studyId = "10000000-0000-4000-8000-000000000001";
const assetId = "10000000-0000-4000-8000-000000000002";
const prediction = {
  ttffMs: 300,
  fixationCount: 2,
  meanFixationDurationMs: 250,
  dwellTimeMs: 650,
  hitRatePct: 70,
  firstFixationPct: 35,
  visitCount: 1,
  rationale: "Logotipo grande y aislado, bajo un escenario de cinco segundos.",
};
const output = () => ({
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
      eyeMetrics: prediction,
    },
  ],
  criteria: Object.fromEntries(
    ["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map(
      (key) => [key, { score: 3, evidence: "Evidencia visible" }],
    ),
  ),
  issues: [],
  strengths: ["Marca reconocible"],
  limitations: [],
});
const response = (data: unknown) => ({
  text: JSON.stringify(data),
  model: "test-vision",
});

function database({
  reviewed = false,
  quota = 0,
  eye = false,
  writeError = false,
} = {}) {
  const update = vi.fn();
  const storage = vi.fn(async () => ({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    let counting = false;
    const q = {
      select: (_columns?: string, options?: { head?: boolean }) => {
        counting = !!options?.head;
        return q;
      },
      eq: () => q,
      gte: () => q,
      maybeSingle: async () => ({
        data:
          table === "studies"
            ? {
                id: studyId,
                config: {
                  mode: "pieces",
                  objective: "Atención a la marca",
                  ...(eye ? { eyeTracking: { durationSeconds: 5 } } : {}),
                },
              }
            : {
                id: assetId,
                study_id: studyId,
                title: "Anuncio",
                storage_path: "piece.png",
                metrics: { value: 1 },
                aois_source: reviewed ? "analyst" : "ai",
              },
      }),
      update: (patch: unknown) => {
        update(patch);
        return q;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          count: counting ? quota : null,
          error: writeError ? { message: "denied" } : null,
        }).then(resolve),
    };
    return q;
  });
  mocks.auth.mockResolvedValue({
    user: { id: "researcher" },
    supabase: { from, storage: { from: () => ({ download: storage }) } },
  });
  return { update, storage };
}
function fd() {
  const form = new FormData();
  form.set("studyId", studyId);
  form.set("assetId", assetId);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.complete.mockReset();
  mocks.image.mockResolvedValue({
    plan: planTiles(1000, 1000),
    parts: [{ type: "image", mediaType: "image/png", data: "test" }],
  });
  mocks.contrast.mockResolvedValue([]);
});

describe("análisis visual individual reutilizado por el lote", () => {
  it("valida las predicciones, guarda su escenario y actualiza detalle, resumen, informe y comparativa", async () => {
    const db = database();
    mocks.complete
      .mockResolvedValueOnce(response(output()))
      .mockResolvedValueOnce(response({ missing: [] }));
    expect((await analyzeAsset({}, fd())).ok).toBe(true);
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_engine_version: "nf-vision-1.3",
        ai_model: "test-vision",
        ai_result: expect.objectContaining({
          result: expect.objectContaining({
            predictionContext: {
              source: "ai_prediction_unvalidated",
              exposureMs: PREDICTION_EXPOSURE_MS,
              version: PREDICTION_VERSION,
            },
            elements: [expect.objectContaining({ eyeMetrics: prediction })],
          }),
        }),
      }),
    );
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual([
      `/studies/${studyId}/assets/${assetId}`,
      `/studies/${studyId}`,
      `/studies/${studyId}/report`,
      `/studies/${studyId}/compare`,
    ]);
  });
  it("conserva las áreas revisadas por el analista al volver a analizar", async () => {
    const db = database({ reviewed: true });
    mocks.complete
      .mockResolvedValueOnce(response(output()))
      .mockResolvedValueOnce(response({ missing: [] }));
    expect((await analyzeAsset({}, fd())).message).toContain("conservaron");
    const patch = db.update.mock.calls[0][0];
    expect(patch).not.toHaveProperty("aois");
    expect(patch).not.toHaveProperty("aois_source");
  });
  it("corrige una respuesta incoherente antes de guardarla", async () => {
    const db = database();
    const invalid = output();
    invalid.elements[0].eyeMetrics = { ...prediction, dwellTimeMs: 100 };
    mocks.complete
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(output()))
      .mockResolvedValueOnce(response({ missing: [] }));
    expect((await analyzeAsset({}, fd())).ok).toBe(true);
    expect(mocks.complete).toHaveBeenCalledTimes(3);
    expect(
      db.update.mock.calls[0][0].ai_result.result.elements[0].eyeMetrics
        .dwellTimeMs,
    ).toBe(650);
  });
  it("no sobrescribe resultados si la nueva respuesta carece de las predicciones requeridas", async () => {
    const db = database();
    const old = output();
    delete (old.elements[0] as { eyeMetrics?: unknown }).eyeMetrics;
    mocks.complete.mockResolvedValue(response(old));
    expect((await analyzeAsset({}, fd())).error).toContain("formato");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("señala cuotas agotadas y rechaza estudios de webcam antes de llamar a la IA", async () => {
    const quota = database({ quota: 30 });
    expect(await analyzeAsset({}, fd())).toMatchObject({ code: "rate_limit" });
    expect(quota.storage).not.toHaveBeenCalled();
    const eye = database({ eye: true });
    expect((await analyzeAsset({}, fd())).error).toContain("otra herramienta");
    expect(eye.storage).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("informa si el análisis no pudo guardarse", async () => {
    const db = database({ writeError: true });
    mocks.complete
      .mockResolvedValueOnce(response(output()))
      .mockResolvedValueOnce(response({ missing: [] }));
    expect((await analyzeAsset({}, fd())).error).toContain(
      "no se pudo guardar",
    );
    expect(db.update).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
