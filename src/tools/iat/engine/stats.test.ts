import { describe, expect, it } from "vitest";
import { classifyConcordance, computeStudyAggregates } from "./stats";
import type { SessionForStats } from "./stats";
import { oneSampleTTest } from "./math";

function session(
  id: string,
  ds: (number | null)[],
  extra: Partial<SessionForStats> = {},
): SessionForStats {
  return {
    id,
    deviceType: "desktop",
    segments: {},
    explicit: null,
    excluded: false,
    dimensions: ds.map((d) => ({ d, valid: d !== null })),
    ...extra,
  };
}

const labels = ["Confiable", "Premium"];

describe("oneSampleTTest", () => {
  it("coincide con valores de referencia", () => {
    // xs = [1,2,3,4,5]: m=3, sd=√2.5, se=√0.5, t=3/√0.5=4.2426, df=4, p≈0.0132
    const r = oneSampleTTest([1, 2, 3, 4, 5])!;
    expect(r.mean).toBe(3);
    expect(r.t).toBeCloseTo(4.2426, 3);
    expect(r.p).toBeCloseTo(0.01324, 4);
    expect(r.ci95[0]).toBeCloseTo(3 - 2.7764 * Math.sqrt(0.5), 3);
    expect(r.ci95[1]).toBeCloseTo(3 + 2.7764 * Math.sqrt(0.5), 3);
    expect(r.cohenD).toBeCloseTo(3 / Math.sqrt(2.5), 6);
  });
  it("null con n < 2 o sin varianza", () => {
    expect(oneSampleTTest([1])).toBeNull();
    expect(oneSampleTTest([2, 2, 2])).toBeNull();
  });
});

describe("classifyConcordance", () => {
  it.each([
    ["A", "A", "consistent"],
    ["B", "B", "consistent"],
    ["none", "neutral", "consistent"],
    ["A", "B", "dissonant"],
    ["B", "A", "dissonant"],
    ["none", "A", "partial"],
    ["A", "neutral", "partial"],
  ] as const)("implícito %s / explícito %s → %s", (imp, exp, out) => {
    expect(classifyConcordance(imp, exp)).toBe(out);
  });
});

describe("computeStudyAggregates", () => {
  const sessions = [
    session("1", [0.5, 0.2], { explicit: "A", deviceType: "desktop" }),
    session("2", [0.7, -0.4], { explicit: "B", deviceType: "mobile" }),
    session("3", [0.3, 0.1], { explicit: "neutral" }),
    session("4", [null, 0.0], { explicit: "A" }),
    session("5", [0.9, 0.5], { excluded: true }),
  ];

  const agg = computeStudyAggregates(sessions, { dimensionLabels: labels, minGroupSize: 2 });

  it("cuenta sesiones y exclusiones", () => {
    expect(agg.nSessions).toBe(5);
    expect(agg.nExcluded).toBe(1);
    expect(agg.nWithUsableData).toBe(4);
  });

  it("calcula n y media por dimensión ignorando nulos y excluidas", () => {
    expect(agg.dimensions[0].n).toBe(3); // sesión 4 sin D, sesión 5 excluida
    expect(agg.dimensions[0].test!.mean).toBeCloseTo((0.5 + 0.7 + 0.3) / 3, 10);
    expect(agg.dimensions[1].n).toBe(4);
  });

  it("clasifica fuerza y dirección", () => {
    // dim 0: 0.5 (moderada A), 0.7 (fuerte A), 0.3 (leve A)
    expect(agg.dimensions[0].strengthCounts).toEqual({ none: 0, slight: 1, moderate: 1, strong: 1 });
    expect(agg.dimensions[0].directionCounts).toEqual({ A: 3, B: 0, none: 0 });
  });

  it("calcula concordancia implícito/explícito", () => {
    // dim 0: s1 A/A consistente; s2 A/B disonante; s3 A/neutral parcial.
    expect(agg.dimensions[0].concordance).toEqual({ n: 3, consistent: 1, dissonant: 1, partial: 1 });
  });

  it("el compuesto es la media de los D utilizables por sesión", () => {
    // s1: .35, s2: .15, s3: .2, s4: 0.0 (sólo dim 1)
    expect(agg.overall.n).toBe(4);
    expect(agg.overall.test!.mean).toBeCloseTo((0.35 + 0.15 + 0.2 + 0) / 4, 10);
  });

  it("el histograma suma n y cubre [-2, 2]", () => {
    const h = agg.dimensions[0].histogram;
    expect(h.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(h[0].from).toBe(-2);
    expect(h[h.length - 1].to).toBe(2);
  });

  it("por defecto omite dimensiones con datos no válidos; includeInvalid las incluye", () => {
    const withInvalid = [
      session("a", [0.5], {}),
      { ...session("b", [0.9]), dimensions: [{ d: 0.9, valid: false }] },
    ];
    const strict = computeStudyAggregates(withInvalid, { dimensionLabels: ["x"] });
    const loose = computeStudyAggregates(withInvalid, { dimensionLabels: ["x"], includeInvalid: true });
    expect(strict.dimensions[0].n).toBe(1);
    expect(loose.dimensions[0].n).toBe(2);
  });

  it("desglosa por dispositivo y suprime grupos pequeños", () => {
    const device = agg.byDevice;
    // desktop: sesiones 1,3,4 (5 excluida); mobile: sólo 1 sesión → suprimido con minGroupSize=2
    expect(device.groups.map((g) => g.group)).toEqual(["desktop"]);
    expect(device.suppressedGroups).toBe(1);
    expect(agg.deviceMix).toEqual({ desktop: 3, mobile: 1, tablet: 0, unknown: 0 });
  });

  it("desglosa por segmento demográfico con n mínimo", () => {
    const seg = computeStudyAggregates(
      [
        session("1", [0.5], { segments: { genero: "F" } }),
        session("2", [0.7], { segments: { genero: "F" } }),
        session("3", [-0.3], { segments: { genero: "M" } }),
      ],
      { dimensionLabels: ["x"], minGroupSize: 2 },
    );
    const genero = seg.bySegment.find((s) => s.variable === "genero")!;
    expect(genero.groups).toHaveLength(1);
    expect(genero.groups[0]).toMatchObject({ group: "F", nSessions: 2 });
    expect(genero.groups[0].meanD[0]).toBeCloseTo(0.6, 4);
    expect(genero.suppressedGroups).toBe(1);
  });

  it("cuenta respuestas explícitas (excluyendo excluidas)", () => {
    expect(agg.explicitCounts).toEqual({ A: 2, B: 1, neutral: 1, missing: 0 });
  });

  it("maneja un estudio sin sesiones", () => {
    const empty = computeStudyAggregates([], { dimensionLabels: labels });
    expect(empty.nSessions).toBe(0);
    expect(empty.dimensions[0].test).toBeNull();
    expect(empty.overall.n).toBe(0);
  });
});
