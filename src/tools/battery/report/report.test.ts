import { describe, expect, it } from "vitest";
import {
  defaultConsentText,
  DEFAULT_THANK_YOU,
  instrumentItemId,
  type SurveyConfig,
} from "@/tools/survey/engine";
import {
  buildBatteryReport,
  EXPLORATORY_BELOW_N,
  holmAdjust,
  readD,
  MIN_CORRELATION_N,
  ranks,
  spearman,
  type ReportParticipant,
  type ReportStep,
} from "./report";

const surveyConfig: SurveyConfig = {
  version: 1,
  title: "Encuesta",
  texts: {
    consent: defaultConsentText("Encuesta"),
    thankYou: DEFAULT_THANK_YOU,
  },
  blocks: [
    {
      kind: "questions",
      id: "q",
      questions: [
        {
          type: "likert",
          id: "confianza",
          prompt: "Confío en la marca",
          required: true,
          points: 5,
        },
      ],
    },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};

const steps: ReportStep[] = [
  {
    kind: "iat",
    studyId: "iat1",
    name: "IAT café",
    conceptA: "Marca A",
    conceptB: "Marca B",
    dimensions: [
      { id: "calidad", name: "Calidad", positiveLabel: "Confiable" },
    ],
  },
  {
    kind: "survey",
    studyId: "sv1",
    name: "Encuesta de marca",
    config: surveyConfig,
  },
];

function person(
  i: number,
  d: number | null,
  nps: number | null,
  extra: Partial<ReportParticipant> & { confianza?: number } = {},
): ReportParticipant {
  const answers: Record<string, unknown> = {};
  if (nps !== null) answers[instrumentItemId("nps", 1)] = nps;
  answers.confianza = extra.confianza ?? 3;
  return {
    id: `b${i}`,
    ref: `ref${i}`,
    excluded: false,
    iat: { iat1: [d === null ? null : { d, valid: true }] },
    survey: { sv1: answers },
    ...extra,
  };
}

/** 12 participantes: a mayor D, mayor NPS (con ruido para que rho < 1). */
const NPS = [0, 1, 3, 2, 5, 4, 7, 6, 9, 8, 10, 10];
const ds = NPS.map((_, i) => -0.6 + i * 0.1);
const sample = () =>
  ds.map((d, i) => person(i, d, NPS[i]!, { confianza: 1 + (i % 5) }));
const npsMetric = "sv1:nps";

describe("lectura del D-score", () => {
  it("D > 0 favorece al concepto A, D < 0 al B, y cerca de 0 no hay preferencia", () => {
    expect(readD(0.5, "Marca A", "Marca B", "Confiable")).toBe(
      "Moderada · Marca A más asociada a «Confiable»",
    );
    expect(readD(-0.8, "Marca A", "Marca B", "Confiable")).toBe(
      "Fuerte · Marca B más asociada a «Confiable»",
    );
    expect(readD(0.1, "Marca A", "Marca B", "Confiable")).toBe(
      "Sin preferencia clara",
    );
  });

  it("el informe la incluye en cada dimensión (null sin datos)", () => {
    const r = buildBatteryReport(steps, sample());
    expect(r.iat[0]!.reading).toBe(
      readD(r.iat[0]!.mean!, "Marca A", "Marca B", "Confiable"),
    );
    expect(buildBatteryReport(steps, []).iat[0]!.reading).toBeNull();
  });
});

describe("estadística de apoyo", () => {
  it("rangos medios para empates", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("Spearman: valor conocido, signo, sin varianza y muestras mínimas", () => {
    // d = [-1, 1, -1, 1, 0] → Σd² = 4 → ρ = 1 − 6·4 / (5·24) = 0.8
    const c = spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])!;
    expect(c.rho).toBeCloseTo(0.8, 10);
    expect(c.n).toBe(5);
    expect(c.p).toBeGreaterThan(0.05); // n = 5: no alcanza significancia
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])!.rho).toBeCloseTo(-1, 10);
    expect(spearman([1, 2, 3], [4, 4, 4])).toBeNull();
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });

  it("Spearman perfecto: p = 0 y sin intervalo (Fisher no está definido en ±1)", () => {
    const c = spearman([1, 2, 3, 4], [10, 20, 30, 40])!;
    expect(c.rho).toBe(1);
    expect(c.p).toBe(0);
    expect(c.ci95).toBeNull();
  });

  it("el intervalo contiene a ρ y se estrecha al crecer n", () => {
    const small = spearman([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5])!;
    const xs = Array.from({ length: 60 }, (_, i) => i);
    const ys = xs.map((x) => x + ((x * 7) % 11) - 5);
    const big = spearman(xs, ys)!;
    for (const c of [small, big]) {
      expect(c.ci95![0]).toBeLessThan(c.rho);
      expect(c.ci95![1]).toBeGreaterThan(c.rho);
    }
    expect(big.ci95![1] - big.ci95![0]).toBeLessThan(
      small.ci95![1] - small.ci95![0],
    );
  });

  it("Holm: monótono, conserva el orden de entrada y topa en 1", () => {
    expect(holmAdjust([0.01, 0.04, 0.03])).toEqual(
      [0.03, 0.06, 0.06].map((x) => expect.closeTo(x, 10)),
    );
    expect(holmAdjust([0.6, 0.9])).toEqual([1, 1]);
    expect(holmAdjust([])).toEqual([]);
    expect(holmAdjust([0.02])).toEqual([0.02]);
  });
});

describe("informe integrado de la batería", () => {
  it("resume el IAT usando sólo D válidos de participantes incluidos", () => {
    const people = sample();
    people.push({ ...person(20, 0.5, 5), excluded: true }); // excluido: no cuenta
    people.push({ ...person(21, null, 5) }); // sin resultado
    people.push({
      ...person(22, 0.9, 5),
      iat: { iat1: [{ d: 0.9, valid: false }] },
    }); // inválido
    const r = buildBatteryReport(steps, people);
    const dim = r.iat[0]!;
    expect(dim.evidence).toBe("medido");
    expect(dim.n).toBe(12);
    expect(dim.nInvalid).toBe(2);
    expect(dim.mean).toBeCloseTo(ds.reduce((a, b) => a + b, 0) / 12, 10);
    expect(dim.ci95![0]).toBeLessThan(dim.mean!);
    expect(dim.ci95![1]).toBeGreaterThan(dim.mean!);
    expect(dim.interpretation).not.toBeNull();
    expect(r.nParticipants).toBe(15);
    expect(r.nExcluded).toBe(1);
    expect(r.nIncluded).toBe(14);
  });

  it("agrega las encuestas con el motor de encuesta y excluye a los excluidos", () => {
    const people = sample();
    people[0] = { ...people[0]!, excluded: true };
    const r = buildBatteryReport(steps, people);
    const agg = r.surveys[0]!.aggregates;
    expect(agg.nTotal).toBe(12);
    expect(agg.nIncluded).toBe(11);
  });

  it("correlaciona D con métricas de encuesta, etiquetada como estimada y exploratoria con n chico", () => {
    const r = buildBatteryReport(steps, sample());
    const c = r.correlations.find((x) => x.explicit.key === npsMetric)!;
    expect(c.evidence).toBe("estimado");
    expect(c.method).toBe("spearman");
    expect(c.n).toBe(12);
    expect(c.rho).toBeGreaterThan(0.9);
    expect(c.rho).toBeLessThan(1);
    expect(c.exploratory).toBe(true);
    expect(12).toBeLessThan(EXPLORATORY_BELOW_N);
    expect(c.pAdjusted).toBeGreaterThanOrEqual(c.p);
    expect(r.notes.join(" ")).toMatch(/exploratorias/);
    expect(r.notes.join(" ")).toMatch(/causalidad/);
  });

  it("incluye también las escalas sueltas como métricas", () => {
    const r = buildBatteryReport(steps, sample());
    expect(r.metrics.map((m) => m.key).sort()).toEqual([
      "sv1:confianza",
      "sv1:nps",
    ]);
    expect(r.correlations.map((c) => c.explicit.key).sort()).toEqual([
      "sv1:confianza",
      "sv1:nps",
    ]);
    expect(r.notes.join(" ")).toMatch(/Holm/);
  });

  it("no calcula correlaciones con menos de MIN_CORRELATION_N pares y dice por qué", () => {
    const r = buildBatteryReport(
      steps,
      sample().slice(0, MIN_CORRELATION_N - 1),
    );
    expect(r.correlations).toEqual([]);
    expect(
      r.skipped.every(
        (s) => s.reason === "n_insufficient" && s.n === MIN_CORRELATION_N - 1,
      ),
    ).toBe(true);
    expect(r.skipped.length).toBe(2);
    expect(r.notes.join(" ")).toMatch(
      new RegExp(`menos de ${MIN_CORRELATION_N}`),
    );
  });

  it("exactamente MIN_CORRELATION_N pares sí se calcula", () => {
    const r = buildBatteryReport(steps, sample().slice(0, MIN_CORRELATION_N));
    expect(
      r.correlations.some(
        (c) => c.explicit.key === npsMetric && c.n === MIN_CORRELATION_N,
      ),
    ).toBe(true);
  });

  it("los pares incompletos se descartan por métrica (quien no contestó NPS no entra a esa correlación)", () => {
    const people = sample();
    people[3] = person(3, ds[3]!, null, { confianza: 4 });
    people[4] = person(4, null, 5, { confianza: 5 });
    const r = buildBatteryReport(steps, people);
    expect(r.correlations.find((c) => c.explicit.key === npsMetric)!.n).toBe(
      10,
    );
    expect(
      r.correlations.find((c) => c.explicit.key === "sv1:confianza")!.n,
    ).toBe(11);
  });

  it("una métrica constante se reporta como omitida sin varianza, no como correlación 0", () => {
    const people = ds.map((d, i) =>
      person(i, d, 8, { confianza: 1 + (i % 5) }),
    );
    const r = buildBatteryReport(steps, people);
    expect(
      r.correlations.find((c) => c.explicit.key === npsMetric),
    ).toBeUndefined();
    expect(r.skipped.find((s) => s.explicit.includes("NPS"))?.reason).toBe(
      "no_variance",
    );
  });

  it("los excluidos salen en las filas (con la marca) pero no entran a las correlaciones", () => {
    const people = sample();
    people.push({ ...person(30, -0.9, 10), excluded: true });
    const r = buildBatteryReport(steps, people);
    expect(r.rows).toHaveLength(13);
    expect(r.rows.at(-1)!.excluded).toBe(true);
    expect(r.correlations.find((c) => c.explicit.key === npsMetric)!.n).toBe(
      12,
    );
  });

  it("las filas traen D y métricas por clave, con null donde no hay dato", () => {
    const r = buildBatteryReport(steps, [
      person(0, 0.4, null),
      person(1, null, 9),
    ]);
    expect(r.rows[0]).toMatchObject({
      ref: "ref0",
      d: { "iat1:calidad": 0.4 },
      metrics: { "sv1:nps": null, "sv1:confianza": 3 },
    });
    expect(r.rows[1]!.d["iat1:calidad"]).toBeNull();
    expect(r.rows[1]!.metrics["sv1:nps"]).toBe(9);
  });

  it("es determinista y no depende del orden de los participantes", () => {
    const a = buildBatteryReport(steps, sample());
    const b = buildBatteryReport(steps, [...sample()].reverse());
    expect(b.iat).toEqual(a.iat);
    expect(b.correlations).toEqual(a.correlations);
    expect(buildBatteryReport(steps, sample())).toEqual(a);
  });

  it("sin participantes no truena", () => {
    const r = buildBatteryReport(steps, []);
    expect(r.iat[0]).toMatchObject({
      n: 0,
      mean: null,
      ci95: null,
      interpretation: null,
    });
    expect(r.correlations).toEqual([]);
    expect(r.nParticipants).toBe(0);
  });
});
