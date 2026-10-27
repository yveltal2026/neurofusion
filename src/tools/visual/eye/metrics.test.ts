import { describe, expect, it } from "vitest";
import type { Aoi } from "../engine/aoi";
import type { EyeObservation } from "./schema";
import {
  aggregateEyeMetrics,
  detectFixations,
  measureEyeObservation,
} from "./metrics";
import { buildFixationHeatmap } from "./heatmap";

const size = { width: 1000, height: 500 };
const left: Aoi = {
  id: "L",
  label: "Logo",
  kind: "logo",
  box: [0, 0, 0.4, 1],
  attention: 0,
  importance: 3,
  order: null,
};
const right: Aoi = { ...left, id: "R", label: "CTA", box: [0.6, 0, 1, 1] };
const unseen: Aoi = {
  ...left,
  id: "U",
  label: "Precio",
  box: [0.45, 0, 0.55, 0.1],
};
const cluster = (start: number, x: number, duration = 200, step = 50) =>
  Array.from({ length: duration / step + 1 }, (_, i) => ({
    t: start + i * step,
    x,
    y: 0.5,
  }));
function observation(samples: EyeObservation["samples"]): EyeObservation {
  return {
    assetId: "asset",
    durationMs: 5000,
    framesTotal: samples.length,
    framesValid: samples.length,
    samples,
  };
}
const sequence = observation([
  ...cluster(100, 0.2),
  ...cluster(350, 0.8),
  ...cluster(600, 0.2),
]);

describe("fijaciones y KPIs medidos", () => {
  it("detecta secuencia, TTFF, duración, visitas y regresos con números conocidos", () => {
    const measured = measureEyeObservation(
      sequence,
      [left, right, unseen],
      size,
    );
    expect(measured.fixations.map((f) => f.durationMs)).toEqual([
      200, 200, 200,
    ]);
    expect(measured.aois[0]).toMatchObject({
      ttffMs: 100,
      fixationCount: 2,
      meanFixationDurationMs: 200,
      totalFixationDurationMs: 400,
      dwellTimeMs: 400,
      visitCount: 2,
      revisitCount: 1,
      firstFixation: true,
    });
    expect(measured.aois[1]).toMatchObject({
      ttffMs: 350,
      fixationCount: 1,
      visitCount: 1,
      revisitCount: 0,
      firstFixation: false,
    });
    expect(measured.aois[2]).toMatchObject({
      ttffMs: null,
      fixationCount: 0,
      meanFixationDurationMs: null,
      visitCount: 0,
    });
    expect(measured.transitions).toHaveLength(2);
    expect(measured.transitions[0].durationMs).toBe(50);
    expect(measured.transitions[0].amplitudeDiagonalPct).toBeCloseTo(
      (600 / Math.hypot(1000, 500)) * 100,
    );
  });

  it("dwell incluye transiciones internas, pero TFD sólo fijaciones", () => {
    const area = { ...left, box: [0, 0, 1, 1] as Aoi["box"] };
    const m = measureEyeObservation(sequence, [area], size).aois[0];
    expect(m).toMatchObject({
      totalFixationDurationMs: 600,
      dwellTimeMs: 700,
      visitCount: 1,
      revisitCount: 0,
    });
  });

  it("una salida breve sin fijación intermedia también termina la visita", () => {
    const o = observation([
      ...cluster(100, 0.2),
      { t: 350, x: 0.9, y: 0.5 },
      ...cluster(400, 0.2),
    ]);
    expect(measureEyeObservation(o, [left], size).aois[0]).toMatchObject({
      visitCount: 2,
      revisitCount: 1,
      dwellTimeMs: 400,
    });
  });

  it("no inventa fijaciones, visitas continuas ni sacadas durante cortes", () => {
    const o = observation([...cluster(0, 0.2), ...cluster(1000, 0.2)]);
    const m = measureEyeObservation(o, [left], size);
    expect(m.fixations).toHaveLength(2);
    expect(m.transitions).toEqual([]);
    expect(m.aois[0]).toMatchObject({ dwellTimeMs: 400, visitCount: 2 });
    expect(
      detectFixations(
        observation([
          { t: 0, x: 0.2, y: 0.5 },
          { t: 400, x: 0.2, y: 0.5 },
        ]),
        size,
      ),
    ).toEqual([]);
    expect(detectFixations(observation(cluster(0, 0.2, 50)), size)).toEqual([]);
    expect(
      detectFixations(
        observation(
          Array.from({ length: 20 }, () => ({ t: 0, x: 0.2, y: 0.5 })),
        ),
        size,
      ),
    ).toEqual([]);
  });

  it("respeta el aspecto de la imagen y no prolonga el tiempo hasta el final de exposición", () => {
    const f = detectFixations(observation(cluster(100, 0.2)), size);
    expect(f[0]).toMatchObject({ startMs: 100, endMs: 300, durationMs: 200 });
    const points = observation([
      { t: 0, x: 0.2, y: 0.5 },
      { t: 50, x: 0.25, y: 0.5 },
      { t: 100, x: 0.2, y: 0.5 },
    ]);
    expect(detectFixations(points, { width: 100, height: 1000 })).toHaveLength(
      1,
    );
    expect(detectFixations(points, { width: 1000, height: 100 })).toHaveLength(
      0,
    );
  });

  it("agrega ceros, excluye vacíos y duplicados y no redefine la primera fijación por AOI", () => {
    const inputs = [
      { sessionId: "1", participant: "1", observation: sequence },
      {
        sessionId: "2",
        participant: "2",
        observation: observation(cluster(0, 0.8)),
      },
      {
        sessionId: "3",
        participant: "3",
        observation: observation([{ t: 0, x: 0.2, y: 0.5 }]),
      },
      { sessionId: "4", participant: "4", observation: observation([]) },
    ];
    const a = aggregateEyeMetrics(
      [...inputs, inputs[0]],
      [left, right, unseen],
      size,
    );
    expect(a.count).toBe(3);
    expect(a.withoutFixations).toBe(1);
    expect(a.aois[0].ttffMs).toBe(100);
    expect(a.aois[0].hitRatePct).toBeCloseTo(100 / 3);
    expect(a.aois[0].firstFixationPct).toBeCloseTo(100 / 3);
    expect(a.aois[0].fixationCount).toBeCloseTo(2 / 3);
    expect(a.aois[0].totalFixationDurationMs).toBeCloseTo(400 / 3);
    expect(a.aois[1].firstFixationPct).toBeCloseTo(100 / 3);
    expect(a.aois[2]).toMatchObject({
      ttffMs: null,
      meanFixationDurationMs: null,
      hitRatePct: 0,
    });
    expect(aggregateEyeMetrics([], [left], size).aois[0]).toMatchObject({
      ttffMs: null,
      hitRatePct: null,
      firstFixationPct: null,
    });
  });

  it("las áreas superpuestas se calculan de forma independiente", () => {
    const a = aggregateEyeMetrics(
      [{ sessionId: "1", participant: "1", observation: sequence }],
      [left, { ...left, id: "L2" }],
      size,
    );
    expect(a.aois.map((a) => a.hitRatePct)).toEqual([100, 100]);
  });

  it("no pondera por FPS y distingue mapas de número y duración", () => {
    const slow = observation([
      ...cluster(0, 0.2, 200, 50),
      ...cluster(250, 0.8, 400, 50),
    ]);
    const fast = observation([
      ...cluster(0, 0.2, 200, 10),
      ...cluster(250, 0.8, 400, 10),
    ]);
    const measured = (o: EyeObservation) => [
      { observation: o, metrics: measureEyeObservation(o, [], size) },
    ];
    expect(buildFixationHeatmap(measured(slow), "duration")).toEqual(
      buildFixationHeatmap(measured(fast), "duration"),
    );
    const counts = buildFixationHeatmap(measured(slow), "count");
    expect(counts[0].strength).toBe(counts[1].strength);
    const duration = buildFixationHeatmap(measured(slow), "duration");
    expect(duration[0].strength).toBeCloseTo(duration[1].strength / 2);
    expect(buildFixationHeatmap([], "count")).toEqual([]);
  });
});
