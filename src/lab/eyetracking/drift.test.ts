import { describe, expect, it } from "vitest";
import { buildDriftCheck, driftCheckpoints, driftPasses, driftSummary, driftTargets } from "./drift";
import type { TargetResult } from "./metrics";

describe("controles de deriva", () => {
  const summary = { afterAssetCount: 0, medianErrorDeg: 3, maxErrorDeg: 5, coverage: 1, fps: 25, validRatio: 0.9 };

  it("comprueba inicio, cada dos piezas y final sin duplicar el último control", () => {
    expect(driftCheckpoints(1)).toEqual([0, 1]);
    expect(driftCheckpoints(2)).toEqual([0, 2]);
    expect(driftCheckpoints(3)).toEqual([0, 2, 3]);
    expect(driftCheckpoints(5)).toEqual([0, 2, 4, 5]);
  });

  it("rechaza mala cobertura, pérdida de cara, pocos fps y deriva excesiva", () => {
    expect(driftPasses(summary, "laptop")).toBe(true);
    expect(driftPasses({ ...summary, coverage: 2 / 3 }, "laptop")).toBe(false);
    expect(driftPasses({ ...summary, validRatio: 0.5 }, "laptop")).toBe(false);
    expect(driftPasses({ ...summary, fps: 10 }, "laptop")).toBe(false);
    expect(driftPasses({ ...summary, medianErrorDeg: null }, "laptop")).toBe(false);
    expect(driftPasses({ ...summary, maxErrorDeg: 7 }, "laptop")).toBe(false);
    expect(driftPasses({ ...summary, medianErrorDeg: 5, maxErrorDeg: 7 }, "phone")).toBe(true);
  });

  it("calcula el control sin modificar los puntos ni una calibración", () => {
    const targets: TargetResult[] = driftTargets(1000, 600).map((target) => ({
      target, gaze: { x: target.x + 20, y: target.y }, samples: 30, errorPx: 20, precisionPx: 3,
    }));
    const original = structuredClone(targets);
    const check = buildDriftCheck(2, targets, { fps: 30, validRatio: 1, frames: 180, inferenceMsMedian: 10 },
      { screenWidthPx: 1000, screenWidthCm: 30, distanceCm: 50 }, "laptop");
    expect(check.passed).toBe(true);
    expect(check.medianErrorDeg).toBeCloseTo(0.6875, 3);
    expect(targets).toEqual(original);
    expect(driftSummary(check)).not.toHaveProperty("targets");
    expect(buildDriftCheck(0, [{ ...targets[0], gaze: null, errorPx: null }, ...targets.slice(1)],
      { fps: 30, validRatio: 1, frames: 180, inferenceMsMedian: 10 },
      { screenWidthPx: 1000, screenWidthCm: 30, distanceCm: 50 }, "laptop").passed).toBe(false);
  });
});
