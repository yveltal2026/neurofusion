import { describe, expect, it } from "vitest";
import { buildEyeHeatmap } from "./heatmap";
import { collectEyeObservation } from "./samples";
import { completionAllowed, eyeRunSchema, observationsMatchStudy, qualityPasses, requiredDriftChecksPass, type EyeObservation, type EyeQuality } from "./schema";

const assetId = "40000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const observation: EyeObservation = {
  assetId, durationMs: 10_000, framesTotal: 3, framesValid: 2,
  samples: [{ t: 100, x: 0.5, y: 0.5 }, { t: 300, x: 0.8, y: 0.2 }],
};
const quality: EyeQuality = { engineId: "webeyetrack@0.0.2", medianErrorDeg: 2.5, coverage: 1, fps: 25, validRatio: 0.9, passed: true, calibrationClicks: 9, calibrationLayout: "v2-corners-last" };

describe("captura para un estudio visual", () => {
  it("sólo eye-v3 puede finalizar una sesión limitada, con todos los controles informados y sin aprobarla", () => {
    const good = { afterAssetCount: 0, medianErrorDeg: 2, maxErrorDeg: 3, coverage: 1, fps: 30, validRatio: 1, passed: true };
    const bad = { ...good, afterAssetCount: 2, medianErrorDeg: 10, maxErrorDeg: 15 };
    const q: EyeQuality = { ...quality, measurementStatus: "limited", calibrationLayout: "v5-weighted-base",
      driftChecks: [good, bad, { ...bad, afterAssetCount: 3 }],
      recovery: { interruptions: 2, recalibrations: 1, repeatedAssetIds: [assetId], checks: [bad, bad] } };
    expect(completionAllowed(q, "desktop", 3, "eye-v3")).toBe(true);
    expect(qualityPasses(q, "desktop", 3)).toBe(false);
    expect(completionAllowed(q, "desktop", 3, "eye-v2")).toBe(false);
    expect(completionAllowed(q, "desktop", 3, "eye-v1")).toBe(false);
    expect(completionAllowed({ ...q, recovery: { ...q.recovery!, interruptions: 1 } }, "desktop", 3, "eye-v3")).toBe(false);
    expect(completionAllowed({ ...q, recovery: { ...q.recovery!, checks: [good] } }, "desktop", 3, "eye-v3")).toBe(false);
    q.driftChecks!.pop();
    expect(completionAllowed(q, "desktop", 3, "eye-v3")).toBe(false);
  });
  it("la recuperación conserva el historial fallido pero exige un último control válido", () => {
    const check = { afterAssetCount: 0, medianErrorDeg: 2, maxErrorDeg: 3, coverage: 1, fps: 30, validRatio: 1, passed: true };
    const q: EyeQuality = { ...quality, calibrationLayout: "v5-weighted-refinement",
      driftChecks: [check, { ...check, afterAssetCount: 2 }, { ...check, afterAssetCount: 4 }],
      recovery: { interruptions: 1, recalibrations: 0, repeatedAssetIds: [assetId],
        checks: [{ ...check, afterAssetCount: 4, medianErrorDeg: 9, maxErrorDeg: 12, passed: false }, { ...check, afterAssetCount: 2 }] },
    };
    expect(requiredDriftChecksPass(eyeRunSchema.parse({ sessionId, quality: q, observations: [observation] }).quality, "desktop", 4, true)).toBe(true);
    expect(qualityPasses(q, "desktop", 4)).toBe(true);
    q.recovery!.checks[1] = { ...check, medianErrorDeg: 9, passed: true };
    expect(requiredDriftChecksPass(q, "desktop", 4, true)).toBe(false);
    q.recovery!.checks[1] = { ...check, afterAssetCount: 3 };
    expect(requiredDriftChecksPass(q, "desktop", 4, true)).toBe(false);
    q.recovery!.checks[1] = { ...check, afterAssetCount: 2 };
    q.driftChecks!.pop();
    expect(requiredDriftChecksPass(q, "desktop", 4, true)).toBe(false);
  });
  it("exige todos los controles en orden y recalcula su veredicto para las nuevas sesiones", () => {
    const check = { afterAssetCount: 0, medianErrorDeg: 2, maxErrorDeg: 3, coverage: 1, fps: 30, validRatio: 1, passed: false };
    const q: EyeQuality = { ...quality, calibrationLayout: "v5-weighted-refinement", driftChecks: [check, { ...check, afterAssetCount: 2 }, { ...check, afterAssetCount: 3 }] };
    expect(qualityPasses(q, "desktop", 3)).toBe(true);
    expect(qualityPasses({ ...q, driftChecks: [] }, "desktop", 3)).toBe(false);
    expect(qualityPasses({ ...q, driftChecks: [check, check, check] }, "desktop", 3)).toBe(false);
    expect(qualityPasses({ ...q, driftChecks: q.driftChecks!.map((c) => ({ ...c, medianErrorDeg: 10, passed: true })) }, "desktop", 3)).toBe(false);
    expect(requiredDriftChecksPass(quality, "desktop", 3, true)).toBe(false);
    expect(requiredDriftChecksPass(quality, "desktop", 3)).toBe(true);
  });
  it("convierte coordenadas del viewport a la imagen y excluye miradas fuera de ella", () => {
    const result = collectEyeObservation(assetId, [
      { t: 1100, x: 200, y: 150, inferenceMs: 10 },
      { t: 1200, x: 800, y: 150, inferenceMs: 10 },
      { t: 1300, x: null, y: null, inferenceMs: null },
      { t: 1400, x: 300, y: 200, inferenceMs: 10 },
    ], 1000, 2000, { left: 100, top: 100, width: 400, height: 200 });
    expect(result.framesTotal).toBe(4);
    expect(result.framesValid).toBe(3);
    expect(result.samples).toEqual([{ t: 100, x: 0.25, y: 0.25 }, { t: 400, x: 0.5, y: 0.5 }]);
  });

  it("conserva lecturas distribuidas durante toda una exposición larga", () => {
    const frames = Array.from({ length: 1_800 }, (_, i) => ({ t: i * 10, x: i / 1_799, y: 0.5, inferenceMs: 1 }));
    const result = collectEyeObservation(assetId, frames, 0, 18_000, { left: 0, top: 0, width: 1, height: 1 });
    expect(result.samples).toHaveLength(600);
    expect(result.samples[0].t).toBe(0);
    expect(result.samples.at(-1)?.t).toBe(17_990);
  });

  it("rechaza datos simulados, valores fuera de la imagen y tiempos manipulados", () => {
    const run = { sessionId, quality, observations: [observation] };
    expect(eyeRunSchema.safeParse(run).success).toBe(true);
    expect(eyeRunSchema.safeParse({ ...run, quality: { ...quality, engineId: "fake-pointer" } }).success).toBe(false);
    expect(eyeRunSchema.safeParse({ ...run, observations: [{ ...observation, samples: [{ t: 100, x: 1.5, y: 0 }] }] }).success).toBe(false);
    expect(eyeRunSchema.safeParse({ ...run, observations: [{ ...observation, samples: [{ t: 10001, x: 0.5, y: 0 }] }] }).success).toBe(false);
    expect(observationsMatchStudy([observation], [assetId], 10)).toBe(true);
    expect(observationsMatchStudy([observation], [sessionId], 10)).toBe(false);
    expect(qualityPasses({ ...quality, passed: false }, "desktop")).toBe(true);
    expect(qualityPasses({ ...quality, medianErrorDeg: 5 }, "desktop")).toBe(false);
    expect(qualityPasses({ ...quality, medianErrorDeg: 5 }, "mobile")).toBe(true);
  });

  it("da el mismo peso a una sesión lenta y otra rápida en el mapa agregado", () => {
    const slow = { ...observation, samples: [{ t: 100, x: 0.1, y: 0.1 }] };
    const fast = { ...observation, samples: Array.from({ length: 100 }, (_, i) => ({ t: i * 10, x: 0.9, y: 0.9 })) };
    const cells = buildEyeHeatmap([slow, fast], 2, 2);
    expect(cells).toHaveLength(2);
    expect(cells[0].strength).toBeCloseTo(cells[1].strength);
  });
});
