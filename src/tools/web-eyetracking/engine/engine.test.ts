import { describe, expect, it } from "vitest";
import { computeWebEyetrackingAggregate } from "./metrics";
import { normalizeSampleToDocument } from "./normalize";

describe("web-eyetracking engine", () => {
  it("normaliza mirada en viewport compensando scrollY al documento completo", () => {
    // Viewport 1000x800, scrollY = 1200, doc 1000x3200
    // Mirada al centro vertical del viewport (y=0.5 -> 400px + 1200px = 1600px -> 0.5 del doc)
    const pt = normalizeSampleToDocument({
      t: 100,
      x: 0.5,
      y: 0.5,
      scrollX: 0,
      scrollY: 1200,
      vw: 1000,
      vh: 800,
      docW: 1000,
      docH: 3200,
      stepId: "S1",
      kind: "gaze",
    });
    expect(pt.docX).toBeCloseTo(0.5, 4);
    expect(pt.docY).toBeCloseTo(0.5, 4);
  });

  it("limita coordenadas fuera de rango a [0, 1]", () => {
    const pt = normalizeSampleToDocument({
      t: 200,
      x: -0.1,
      y: 1.1,
      scrollX: 0,
      scrollY: 3000,
      vw: 1000,
      vh: 800,
      docW: 1000,
      docH: 3200,
      stepId: "S1",
      kind: "gaze",
    });
    expect(pt.docX).toBe(0);
    expect(pt.docY).toBe(1);
  });

  it("calcula tasa de completitud, duración media y mapa de calor por paso", () => {
    const agg = computeWebEyetrackingAggregate(
      [
        {
          stepEvents: [
            {
              stepId: "S1",
              startedAtMs: 0,
              completedAtMs: 4000,
              completed: true,
              trigger: "manual",
            },
            {
              stepId: "S2",
              startedAtMs: 4000,
              completedAtMs: null,
              completed: false,
              trigger: "timeout",
            },
          ],
          samples: [
            {
              t: 500,
              x: 0.5,
              y: 0.25,
              scrollX: 0,
              scrollY: 0,
              vw: 1000,
              vh: 1000,
              docW: 1000,
              docH: 2000,
              stepId: "S1",
              kind: "gaze",
            },
            {
              t: 900,
              x: 0.5,
              y: 0.25,
              scrollX: 0,
              scrollY: 0,
              vw: 1000,
              vh: 1000,
              docW: 1000,
              docH: 2000,
              stepId: "S1",
              kind: "click",
            },
          ],
        },
        {
          stepEvents: [
            {
              stepId: "S1",
              startedAtMs: 0,
              completedAtMs: 6000,
              completed: true,
              trigger: "manual",
            },
          ],
          samples: [],
        },
      ],
      ["S1", "S2"],
    );

    expect(agg.totalRuns).toBe(2);
    expect(agg.steps[0]).toMatchObject({
      stepId: "S1",
      attempts: 2,
      completions: 2,
      completionRate: 1,
      meanDurationMs: 5000,
      gazeCount: 1,
      clickCount: 1,
    });
    expect(agg.steps[1]).toMatchObject({
      stepId: "S2",
      attempts: 1,
      completions: 0,
      completionRate: 0,
      meanDurationMs: null,
    });
    expect(agg.heatmapsByStep.S1).toHaveLength(1);
    expect(agg.heatmapsByStep.S1[0].weight).toBe(1);
  });
});
