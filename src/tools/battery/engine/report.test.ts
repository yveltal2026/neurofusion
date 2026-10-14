import { describe, expect, it } from "vitest";
import {
  buildBatteryReport,
  correlationCi,
  correlationP,
  MIN_REPORT_N,
  pearson,
  type BatteryParticipant,
  type MeasureDef,
} from "./report";

const MEASURES: MeasureDef[] = [
  { key: "iat:a", label: "IAT · D", family: "implicit", evidence: "medido" },
  { key: "sus", label: "SUS", family: "explicit", evidence: "medido" },
];

const person = (id: string, d: number | null, sus: number | null, over: Partial<BatteryParticipant> = {}): BatteryParticipant => ({
  id,
  excluded: false,
  completed: true,
  values: { "iat:a": d, sus },
  ...over,
});

describe("pearson", () => {
  it("ejemplo clásico: x = 1..5, y = 2,4,5,4,5 → r = 0.7746", () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.7746, 4);
  });
  it("correlación perfecta, inversa y nula", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(pearson([1, 2, 3, 4, 5], [1, -1, 0, 1, -1])).toBeCloseTo(-0.3162, 3);
  });
  it("devuelve null con n < 3 o sin variación", () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("p del ejemplo clásico ≈ 0.124 (t = 2.12, gl = 3)", () => {
    expect(correlationP(0.7746, 5)).toBeCloseTo(0.124, 2);
  });
  it("IC de Fisher contiene a r y queda en [-1, 1]", () => {
    const ci = correlationCi(0.5, 50)!;
    expect(ci[0]).toBeLessThan(0.5);
    expect(ci[1]).toBeGreaterThan(0.5);
    expect(ci[0]).toBeGreaterThan(-1);
    expect(ci[1]).toBeLessThan(1);
    // r = .5, n = 50: z = .5493, se = .1459 → [.2575, .6833]
    expect(ci[0]).toBeCloseTo(0.2575, 3);
    expect(ci[1]).toBeCloseTo(0.6833, 3);
    expect(correlationCi(0.5, 3)).toBeNull();
  });
});

describe("informe integrado", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => person(`p${i}`, 0.1 * i + ((i * 7) % 3) * 0.05, 50 + 4 * i + ((i * 5) % 4)));

  it("no reporta ninguna cifra con menos de 5 participantes", () => {
    const r = buildBatteryReport(MEASURES, rows(MIN_REPORT_N - 1));
    expect(r.measures.every((m) => m.suppressed && m.mean === null)).toBe(true);
    expect(r.correlations[0]!.r).toBeNull();
    expect(r.correlations[0]!.reason).toMatch(/al menos 5/);
    expect(r.warnings.join(" ")).toMatch(/no se reporta ninguna cifra/);
  });

  it("calcula resumen y correlación con n suficiente", () => {
    const r = buildBatteryReport(MEASURES, rows(40));
    const sus = r.measures.find((m) => m.key === "sus")!;
    expect(sus.n).toBe(40);
    expect(sus.mean).not.toBeNull();
    expect(sus.ci95![0]).toBeLessThan(sus.mean!);
    const c = r.correlations[0]!;
    expect(c.n).toBe(40);
    expect(c.r!).toBeGreaterThan(0.9);
    expect(c.p!).toBeLessThan(0.001);
    expect(c.smallSample).toBe(false);
  });

  it("sólo correlaciona implícito × explícito", () => {
    const measures: MeasureDef[] = [...MEASURES, { key: "nps", label: "NPS", family: "explicit", evidence: "medido" }];
    const r = buildBatteryReport(measures, rows(10).map((p, i) => ({ ...p, values: { ...p.values, nps: i } })));
    expect(r.correlations.map((c) => `${c.a}~${c.b}`)).toEqual(["iat:a~sus", "iat:a~nps"]);
  });

  it("excluye a los excluidos y a las sesiones incompletas", () => {
    const base = rows(10);
    const r = buildBatteryReport(MEASURES, [...base, person("x", 0.5, 90, { excluded: true }), person("y", 0.5, 90, { completed: false })]);
    expect(r.funnel).toEqual({ total: 12, completed: 11, excluded: 1, included: 10 });
    expect(r.measures[1]!.n).toBe(10);
  });

  it("usa sólo a quienes tienen ambas medidas", () => {
    const base = rows(12);
    base[0] = person("p0", null, 50);
    base[1] = person("p1", 0.2, null);
    const r = buildBatteryReport(MEASURES, base);
    expect(r.correlations[0]!.n).toBe(10);
  });

  it("marca muestra pequeña y avisa de comparaciones múltiples", () => {
    const measures: MeasureDef[] = [...MEASURES, { key: "nps", label: "NPS", family: "explicit", evidence: "medido" }];
    const r = buildBatteryReport(measures, rows(12).map((p, i) => ({ ...p, values: { ...p.values, nps: (i * 3) % 7 } })));
    expect(r.correlations.every((c) => c.smallSample)).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/Muestra pequeña/);
    expect(r.warnings.join(" ")).toMatch(/comparaciones múltiples/);
  });

  it("detecta una medida sin variación", () => {
    const flat = Array.from({ length: 8 }, (_, i) => person(`f${i}`, 0.3, 50 + i));
    expect(buildBatteryReport(MEASURES, flat).correlations[0]!.reason).toMatch(/no varía/);
  });

  it("siempre recuerda que correlación no implica causa y declara la evidencia de cada medida", () => {
    const r = buildBatteryReport(MEASURES, rows(10));
    expect(r.warnings.join(" ")).toMatch(/no implica causa/);
    expect(r.measures.every((m) => m.evidence === "medido")).toBe(true);
  });

  it("sin sesiones avisa que no hay datos", () => {
    const r = buildBatteryReport(MEASURES, []);
    expect(r.funnel.total).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/Aún no hay sesiones completas/);
  });
});
