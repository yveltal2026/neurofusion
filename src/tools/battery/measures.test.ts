import { describe, expect, it } from "vitest";
import { DEFAULT_THANK_YOU, defaultConsentText, type SurveyConfig } from "@/tools/survey/engine";
import { buildBatteryReport } from "./engine/report";
import { compositeD, reportMeasures, toParticipants, type BatterySessionData, type ReportStep } from "./measures";

const survey: SurveyConfig = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    { kind: "questions", id: "q", questions: [{ type: "text", id: "t", prompt: "x", required: false }] },
    { kind: "instrument", id: "sus", instrumentId: "sus", required: true },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
    { kind: "instrument", id: "sam", instrumentId: "sam", required: true },
  ],
};
const steps: ReportStep[] = [
  { studyId: "i1", name: "IAT café", tool: "iat", dimensionNames: ["Confianza", "Precio"] },
  { studyId: "s1", name: "Encuesta", tool: "survey", config: survey },
];

describe("reportMeasures", () => {
  it("una medida implícita por IAT y una explícita por instrumento (SAM en tres)", () => {
    const m = reportMeasures(steps);
    expect(m.map((x) => x.key)).toEqual([
      "iat:i1",
      "survey:s1:sus",
      "survey:s1:nps",
      "survey:s1:sam:valence",
      "survey:s1:sam:arousal",
      "survey:s1:sam:dominance",
    ]);
    expect(m.filter((x) => x.family === "implicit")).toHaveLength(1);
    expect(m.every((x) => x.evidence === "medido")).toBe(true);
    expect(m[0]!.label).toContain("IAT café");
  });

  it("no genera medidas para preguntas sueltas", () => {
    expect(reportMeasures([steps[1]!]).some((x) => x.key.includes(":q"))).toBe(false);
  });
});

describe("compositeD", () => {
  it("promedia las dimensiones válidas", () => {
    expect(compositeD([{ d: 0.4, valid: true }, { d: 0.2, valid: true }], false)).toBeCloseTo(0.3, 12);
  });
  it("ignora las dudosas salvo que se pida incluirlas", () => {
    const dims = [{ d: 0.4, valid: true }, { d: 1.2, valid: false }];
    expect(compositeD(dims, false)).toBe(0.4);
    expect(compositeD(dims, true)).toBeCloseTo(0.8, 12);
  });
  it("devuelve null si no hay D utilizable", () => {
    expect(compositeD([{ d: null, valid: true }], false)).toBeNull();
    expect(compositeD([{ d: 0.5, valid: false }], false)).toBeNull();
    expect(compositeD([], false)).toBeNull();
  });
});

describe("toParticipants + informe", () => {
  const session = (n: number, d: number, sus: number): BatterySessionData => ({
    id: `p${n}`,
    excluded: false,
    completed: true,
    iat: [{ studyId: "i1", dimensions: [{ d, valid: true }] }],
    survey: [
      {
        studyId: "s1",
        scores: [
          { blockId: "sus", instrumentId: "sus", score: { instrument: "sus", score: sus } },
          { blockId: "nps", instrumentId: "nps", score: { instrument: "nps", value: 9, category: "promoter" } },
          { blockId: "sam", instrumentId: "sam", score: { instrument: "sam", valence: 7, arousal: 4, dominance: 6 } },
        ],
      },
    ],
  });

  it("traduce las puntuaciones de cada instrumento a valores de medida", () => {
    const [p] = toParticipants([session(1, 0.3, 80)]);
    expect(p!.values).toMatchObject({
      "iat:i1": 0.3,
      "survey:s1:sus": 80,
      "survey:s1:nps": 9,
      "survey:s1:sam:valence": 7,
      "survey:s1:sam:arousal": 4,
      "survey:s1:sam:dominance": 6,
    });
  });

  it("un instrumento sin puntuación (incompleto) deja la medida vacía", () => {
    const s = session(1, 0.3, 80);
    s.survey[0]!.scores = [{ blockId: "sus", instrumentId: "sus", score: null }];
    expect(toParticipants([s])[0]!.values["survey:s1:sus"]).toBeUndefined();
  });

  it("de punta a punta: la correlación D × SUS sale del informe", () => {
    const sessions = Array.from({ length: 12 }, (_, i) => session(i, 0.05 * i, 50 + 3 * i + (i % 3)));
    const report = buildBatteryReport(reportMeasures(steps), toParticipants(sessions));
    const c = report.correlations.find((x) => x.b === "survey:s1:sus")!;
    expect(c.n).toBe(12);
    expect(c.r!).toBeGreaterThan(0.95);
    // NPS y SAM no varían entre participantes en este ejemplo: se avisa en vez de inventar una cifra.
    expect(report.correlations.find((x) => x.b === "survey:s1:nps")!.reason).toMatch(/no varía/);
  });
});
