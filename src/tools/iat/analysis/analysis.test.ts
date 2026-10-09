import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { computeStudyAggregates, type SessionForStats } from "../engine/stats";
import { concordanceChart, directionChart, histogramChart, meanDChart } from "./charts";
import { buildUserPrompt, roundDeep, SYSTEM_PROMPT } from "./prompt";
import { analysisResultSchema } from "./schema";
import { buildWarnings } from "./warnings";

const config: IatConfig = {
  ...defaultIatConfig(),
  product: "café",
  conceptA: { label: "Marca A", stimuli: ["Marca A"] },
  conceptB: { label: "Marca B", stimuli: ["Marca B"] },
  dimensions: [
    { id: "c", name: "Confianza", positiveLabel: "Confiable", negativeLabel: "Poco confiable", positiveWords: ["a", "b", "c", "d", "e"], negativeWords: ["f", "g", "h", "i", "j"] },
  ],
  texts: { consent: defaultConsentText("café"), thankYou: "ok" },
};

function sessions(n: number, over: (i: number) => Partial<SessionForStats> = () => ({})): SessionForStats[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `SECRET-SESSION-${i}`,
    deviceType: "desktop" as const,
    segments: { gender: i % 2 ? "Mujer" : "Hombre" },
    explicit: (i % 3 === 0 ? "B" : "A") as "A" | "B",
    excluded: false,
    dimensions: [{ d: 0.2 + (i % 5) * 0.15, valid: true }],
    ...over(i),
  }));
}

const agg = (s: SessionForStats[], minGroupSize = 3) => computeStudyAggregates(s, { dimensionLabels: ["Confianza"], minGroupSize });
const counts = { completed: 0, invalidCompleted: 0, duplicatesFlagged: 0 };

describe("buildWarnings", () => {
  it("sin datos → error", () => {
    expect(buildWarnings(agg([]), counts)).toEqual([{ level: "error", text: expect.stringContaining("no hay participantes") }]);
  });
  it("muestra pequeña vs muy pequeña vs suficiente", () => {
    expect(buildWarnings(agg(sessions(5)), counts)[0].text).toContain("muy pequeña");
    expect(buildWarnings(agg(sessions(20)), counts)[0].text).toContain("Muestra pequeña");
    expect(buildWarnings(agg(sessions(40)), counts).filter((w) => /muestra/i.test(w.text))).toEqual([]);
  });
  it("avisa de dispositivos táctiles ≥ 20 %, duplicados, exclusiones e inválidas", () => {
    const s = sessions(40, (i) => ({ deviceType: i < 10 ? "mobile" : "desktop", excluded: i === 39 }));
    const w = buildWarnings(agg(s), { completed: 40, invalidCompleted: 2, duplicatesFlagged: 3 }).map((x) => x.text).join("\n");
    expect(w).toMatch(/celular o tableta/);
    expect(w).toMatch(/3 sesión\(es\) están marcadas como posibles duplicados/);
    expect(w).toMatch(/1 sesión\(es\) fueron excluidas/);
    expect(w).toMatch(/2 sesión\(es\) con calidad de datos dudosa/);
  });
  it("no avisa de dispositivos con < 20 % táctil", () => {
    const s = sessions(40, (i) => ({ deviceType: i < 4 ? "mobile" : "desktop" }));
    expect(buildWarnings(agg(s), counts).map((x) => x.text).join()).not.toMatch(/celular/);
  });
});

describe("prompt (privacidad y contenido)", () => {
  const a = agg(sessions(12));
  const prompt = buildUserPrompt(config, a, buildWarnings(a, counts));

  it("incluye contexto conceptual y agregados", () => {
    expect(prompt).toContain("Marca A");
    expect(prompt).toContain("Confiable");
    expect(prompt).toContain("agregados");
    expect(prompt).toContain('"histogram"');
  });
  it("NO incluye ids de sesión, ip, user agent ni textos de consentimiento", () => {
    expect(prompt).not.toContain("SECRET-SESSION");
    for (const banned of ["ip_hash", "user_agent", "device_id", "demographics", "Estás invitado"]) expect(prompt).not.toContain(banned);
  });
  it("el system prompt fija la convención del signo y prohíbe inventar cifras", () => {
    expect(SYSTEM_PROMPT).toContain("POLO POSITIVO");
    expect(SYSTEM_PROMPT).toMatch(/Nunca inventes/);
    expect(SYSTEM_PROMPT).toContain("executiveSummary");
  });
  it("roundDeep redondea y convierte no finitos en null", () => {
    expect(roundDeep({ a: 0.123456, b: [1.99999, Number.NaN], c: "x" })).toEqual({ a: 0.123, b: [2, null], c: "x" });
  });
});

describe("analysisResultSchema", () => {
  const valid = {
    executiveSummary: "Resumen",
    findings: [{ dimension: "Confianza", headline: "h", interpretation: "i" }],
    implicitVsExplicit: { consistency: "mixed", summary: "s" },
    segments: [],
    deviceNote: null,
    limitations: ["l"],
    recommendations: ["r"],
  };
  it("acepta un resultado válido y asigna deviceNote null si falta", () => {
    expect(analysisResultSchema.safeParse(valid).success).toBe(true);
    const { deviceNote: _omit, ...without } = valid;
    void _omit;
    const r = analysisResultSchema.parse(without);
    expect(r.deviceNote).toBeNull();
  });
  it("rechaza consistencia fuera del catálogo y textos vacíos", () => {
    expect(analysisResultSchema.safeParse({ ...valid, implicitVsExplicit: { consistency: "alta", summary: "s" } }).success).toBe(false);
    expect(analysisResultSchema.safeParse({ ...valid, executiveSummary: "  " }).success).toBe(false);
  });
});

describe("charts", () => {
  const a = agg(sessions(20));
  it("meanDChart: media dentro del IC y barras de error consistentes", () => {
    const rows = meanDChart(a);
    expect(rows.map((r) => r.label)).toEqual(["Confianza", "Compuesto"]);
    for (const r of rows) {
      expect(r.low).toBeLessThanOrEqual(r.mean);
      expect(r.high).toBeGreaterThanOrEqual(r.mean);
      expect(r.error[0]).toBeCloseTo(r.mean - r.low, 3);
      expect(r.error[1]).toBeCloseTo(r.high - r.mean, 3);
    }
  });
  it("directionChart y concordanceChart suman ~100 %", () => {
    for (const r of directionChart(a)) expect(r.A + r.none + r.B).toBeGreaterThan(99.5);
    for (const r of concordanceChart(a)) expect(r.consistent + r.partial + r.dissonant).toBeGreaterThan(99.5);
  });
  it("histogramChart cubre todos los participantes", () => {
    const rows = histogramChart(a.dimensions[0]);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(20);
    expect(rows[0].range).toBe("-2.00 a -1.75");
  });
  it("sin datos no hay filas", () => {
    const empty = agg([]);
    expect(meanDChart(empty)).toEqual([]);
    expect(directionChart(empty)).toEqual([]);
    expect(concordanceChart(empty)).toEqual([]);
  });
});
