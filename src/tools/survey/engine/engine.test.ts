import { describe, expect, it } from "vitest";
import {
  buildAnswerSchema,
  computeSurveyAggregates,
  cronbachAlpha,
  directionalValues,
  instrumentItemId,
  listItems,
  npsCategory,
  renderItemText,
  scoreInstrument,
  scoreSurvey,
  splitByGroup,
  summarizeNps,
  summarizeNumeric,
  surveyConfigSchema,
  wilsonInterval,
  INSTRUMENTS,
  INSTRUMENT_IDS,
  type SurveyConfig,
  type SurveyResponse,
} from "./index";

const config: SurveyConfig = {
  version: 1,
  title: "Estudio de prueba",
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [
        {
          type: "select",
          id: "frecuencia",
          prompt: "¿Con qué frecuencia compras en línea?",
          required: true,
          options: ["Semanal", "Mensual", "Rara vez"],
        },
        {
          type: "multiselect",
          id: "canales",
          prompt: "¿Dónde compras?",
          required: false,
          options: ["Web", "App", "Tienda"],
        },
        {
          type: "likert",
          id: "confianza",
          prompt: "Confío en las tiendas en línea",
          required: true,
          points: 5,
        },
        {
          type: "number",
          id: "gasto",
          prompt: "Gasto mensual",
          required: false,
          min: 0,
          max: 100000,
        },
        {
          type: "text",
          id: "comentario",
          prompt: "Comentarios",
          required: false,
        },
      ],
    },
    {
      kind: "instrument",
      id: "sus",
      instrumentId: "sus",
      subject: "esta tienda en línea",
      required: true,
    },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};

/** Respuestas completas válidas; `sus` es un arreglo de 10 valores. */
function answers(
  opts: { sus?: number[]; nps?: number; extra?: Record<string, unknown> } = {},
) {
  const sus = opts.sus ?? [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
  const out: Record<string, unknown> = {
    frecuencia: "Semanal",
    confianza: 4,
    nps_1: opts.nps ?? 9,
    ...opts.extra,
  };
  sus.forEach((v, i) => {
    out[instrumentItemId("sus", i + 1)] = v;
  });
  return out;
}

describe("SUS", () => {
  it("mejor caso = 100, neutro = 50, peor caso = 0", () => {
    expect(scoreInstrument("sus", [5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toEqual({
      instrument: "sus",
      score: 100,
    });
    expect(scoreInstrument("sus", Array(10).fill(3))).toEqual({
      instrument: "sus",
      score: 50,
    });
    expect(scoreInstrument("sus", [1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toEqual({
      instrument: "sus",
      score: 0,
    });
  });

  it("caso calculado a mano: impares 4,4,5,4,4 (16) y pares 2,1,2,2,2 → 5−v = 3,4,3,3,3 (16) → 32 × 2,5 = 80", () => {
    expect(scoreInstrument("sus", [4, 2, 4, 1, 5, 2, 4, 2, 4, 2])).toEqual({
      instrument: "sus",
      score: 80,
    });
  });

  it("rechaza longitud incorrecta, valores fuera de escala y no enteros", () => {
    expect(scoreInstrument("sus", [3, 3, 3])).toBeNull();
    expect(scoreInstrument("sus", [6, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBeNull();
    expect(scoreInstrument("sus", [0, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBeNull();
    expect(scoreInstrument("sus", [2.5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBeNull();
  });

  it("los ítems pares del SUS están marcados como inversos y los impares no", () => {
    INSTRUMENTS.sus.items.forEach((item) =>
      expect(Boolean(item.reverse)).toBe(item.n % 2 === 0),
    );
  });

  it("orienta los ítems inversos en la misma dirección para el alfa", () => {
    expect(directionalValues("sus", [5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toEqual(
      Array(10).fill(5),
    );
  });
});

describe("NPS", () => {
  it("categorías en los límites", () => {
    expect([0, 6, 7, 8, 9, 10].map(npsCategory)).toEqual([
      "detractor",
      "detractor",
      "passive",
      "passive",
      "promoter",
      "promoter",
    ]);
  });

  it("50 promotores, 30 pasivos y 20 detractores → NPS 30 con IC95 ±15,3", () => {
    const values = [
      ...Array(50).fill(10),
      ...Array(30).fill(8),
      ...Array(20).fill(3),
    ];
    const s = summarizeNps(values)!;
    expect(s).toMatchObject({
      n: 100,
      promoters: 50,
      passives: 30,
      detractors: 20,
    });
    expect(s.nps).toBeCloseTo(30, 10);
    expect(s.ci95[0]).toBeCloseTo(30 - 15.308, 2);
    expect(s.ci95[1]).toBeCloseTo(30 + 15.308, 2);
  });

  it("todos promotores = 100 y el IC no pasa de 100", () => {
    const s = summarizeNps(Array(10).fill(10))!;
    expect(s.nps).toBe(100);
    expect(s.ci95[1]).toBe(100);
  });

  it("sin datos → null", () => {
    expect(summarizeNps([])).toBeNull();
  });
});

describe("otros instrumentos", () => {
  it("SAM devuelve valencia, activación y dominancia", () => {
    expect(scoreInstrument("sam", [7, 3, 5])).toEqual({
      instrument: "sam",
      valence: 7,
      arousal: 3,
      dominance: 5,
    });
    expect(scoreInstrument("sam", [10, 3, 5])).toBeNull();
  });

  it("intención de compra: 4 y 5 cuentan como dos categorías superiores", () => {
    expect(scoreInstrument("purchase_intent", [3])).toMatchObject({
      topTwoBox: false,
    });
    expect(scoreInstrument("purchase_intent", [4])).toMatchObject({
      topTwoBox: true,
    });
    expect(scoreInstrument("purchase_intent", [5])).toMatchObject({
      topTwoBox: true,
    });
  });

  it("actitud = promedio de los tres ítems", () => {
    expect(scoreInstrument("attitude", [7, 6, 5])).toEqual({
      instrument: "attitude",
      score: 6,
    });
  });

  it("cada instrumento tiene versión, fuente y al menos un ítem; los ids son únicos", () => {
    expect(new Set(INSTRUMENT_IDS).size).toBe(INSTRUMENT_IDS.length);
    for (const id of INSTRUMENT_IDS) {
      expect(INSTRUMENTS[id].version).toMatch(/\S/);
      expect(INSTRUMENTS[id].source).toMatch(/\S/);
      expect(INSTRUMENTS[id].items.length).toBeGreaterThan(0);
    }
  });

  it("sustituye {subject} en los textos", () => {
    expect(
      renderItemText(INSTRUMENTS.sus.items[0]!, "esta tienda en línea"),
    ).toBe("Creo que me gustaría usar esta tienda en línea con frecuencia.");
    expect(
      INSTRUMENTS.sus.items.every((i) => i.text.includes("{subject}")),
    ).toBe(true);
  });
});

describe("estadísticos", () => {
  it("alfa de Cronbach: ítems perfectamente correlacionados → 1", () => {
    expect(
      cronbachAlpha([
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ).toBeCloseTo(1, 10);
  });

  it("alfa de Cronbach: ejemplo calculado a mano ≈ 0,9569", () => {
    // varianzas de ítems 1,6667 + 0,9167 + 0,9167 = 3,5; varianza del total 9,6667
    const rows = [
      [2, 3, 3],
      [4, 4, 5],
      [3, 3, 4],
      [5, 5, 5],
    ];
    expect(cronbachAlpha(rows)).toBeCloseTo(0.956897, 5);
  });

  it("alfa de Cronbach: indefinido con varianza total cero o muestra insuficiente", () => {
    expect(
      cronbachAlpha([
        [1, 3],
        [2, 2],
        [3, 1],
      ]),
    ).toBeNull();
    expect(cronbachAlpha([[1, 2]])).toBeNull();
    expect(cronbachAlpha([[1], [2]])).toBeNull();
  });

  it("resumen numérico: 1..5 → media 3, sd 1,5811, IC95 con t de Student", () => {
    const s = summarizeNumeric([1, 2, 3, 4, 5])!;
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(1.5811, 4);
    expect(s.ci95![0]).toBeCloseTo(3 - 1.9632, 3);
    expect(s.ci95![1]).toBeCloseTo(3 + 1.9632, 3);
  });

  it("resumen numérico: n = 1 sin sd ni IC; vacío → null", () => {
    expect(summarizeNumeric([4])).toMatchObject({
      n: 1,
      mean: 4,
      sd: null,
      ci95: null,
    });
    expect(summarizeNumeric([])).toBeNull();
  });

  it("intervalo de Wilson: 50 de 100 → [0,404; 0,596]", () => {
    const [lo, hi] = wilsonInterval(50, 100)!;
    expect(lo).toBeCloseTo(0.4038, 3);
    expect(hi).toBeCloseTo(0.5962, 3);
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(0, 10)![0]).toBe(0);
  });
});

describe("configuración", () => {
  it("la configuración de ejemplo es válida", () => {
    expect(surveyConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rechaza bloques con id repetido", () => {
    const bad = {
      ...config,
      blocks: [config.blocks[1]!, { ...config.blocks[2]!, id: "sus" }],
    };
    expect(surveyConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rechaza una pregunta cuyo id choca con un ítem de instrumento", () => {
    const bad = {
      ...config,
      blocks: [
        {
          kind: "questions",
          id: "perfil",
          questions: [
            { type: "text", id: "sus_1", prompt: "x", required: false },
          ],
        },
        config.blocks[1]!,
      ],
    };
    expect(surveyConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rechaza opciones repetidas (sin importar mayúsculas ni acentos) y ids inválidos", () => {
    const dupOptions = {
      ...config,
      blocks: [
        {
          kind: "questions",
          id: "p",
          questions: [
            {
              type: "select",
              id: "q",
              prompt: "x",
              required: true,
              options: ["Sí", "si"],
            },
          ],
        },
      ],
    };
    expect(surveyConfigSchema.safeParse(dupOptions).success).toBe(false);
    const badId = {
      ...config,
      blocks: [
        {
          kind: "questions",
          id: "Perfil Uno",
          questions:
            config.blocks[0]!.kind === "questions"
              ? config.blocks[0].questions
              : [],
        },
      ],
    };
    expect(surveyConfigSchema.safeParse(badId).success).toBe(false);
  });

  it("rechaza un instrumento desconocido", () => {
    expect(
      surveyConfigSchema.safeParse({
        ...config,
        blocks: [
          { kind: "instrument", id: "x", instrumentId: "otro", required: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("aplana los elementos en orden: 5 preguntas + 10 ítems SUS + 1 NPS", () => {
    const items = listItems(config);
    expect(items).toHaveLength(16);
    expect(items[5]!.id).toBe("sus_1");
    expect(items[5]!.label).toContain("esta tienda en línea");
    expect(items[15]!.id).toBe("nps_1");
  });
});

describe("validación de respuestas", () => {
  const schema = buildAnswerSchema(config);

  it("acepta respuestas completas", () => {
    expect(schema.safeParse(answers()).success).toBe(true);
    expect(
      schema.safeParse(
        answers({
          extra: { canales: ["Web", "App"], gasto: 1200, comentario: "bien" },
        }),
      ).success,
    ).toBe(true);
  });

  it("rechaza ids desconocidos (esquema estricto)", () => {
    expect(schema.safeParse(answers({ extra: { intruso: 1 } })).success).toBe(
      false,
    );
  });

  it("rechaza valores fuera de escala, no enteros y opciones inexistentes", () => {
    expect(schema.safeParse(answers({ extra: { confianza: 6 } })).success).toBe(
      false,
    );
    expect(
      schema.safeParse(answers({ extra: { confianza: 3.5 } })).success,
    ).toBe(false);
    expect(schema.safeParse(answers({ nps: 11 })).success).toBe(false);
    expect(
      schema.safeParse(answers({ extra: { frecuencia: "Diario" } })).success,
    ).toBe(false);
    expect(
      schema.safeParse(answers({ extra: { canales: ["Web", "Web"] } })).success,
    ).toBe(false);
    expect(schema.safeParse(answers({ extra: { gasto: -5 } })).success).toBe(
      false,
    );
  });

  it("exige lo obligatorio y deja pasar lo opcional", () => {
    const withoutRequired = answers();
    delete withoutRequired.frecuencia;
    expect(schema.safeParse(withoutRequired).success).toBe(false);
    const withoutItem = answers();
    delete withoutItem.sus_3;
    expect(schema.safeParse(withoutItem).success).toBe(false);
    expect(schema.safeParse(answers()).success).toBe(true); // sin canales, gasto ni comentario
  });
});

describe("puntuación de la encuesta", () => {
  it("puntúa SUS y NPS de un participante", () => {
    const scores = scoreSurvey(config, answers({ nps: 6 }));
    expect(scores).toEqual([
      {
        blockId: "sus",
        instrumentId: "sus",
        score: { instrument: "sus", score: 100 },
      },
      {
        blockId: "nps",
        instrumentId: "nps",
        score: { instrument: "nps", value: 6, category: "detractor" },
      },
    ]);
  });

  it("un instrumento incompleto queda sin puntuación", () => {
    const a = answers();
    delete a.sus_4;
    expect(scoreSurvey(config, a)[0]!.score).toBeNull();
  });
});

describe("agregados", () => {
  const responses: SurveyResponse[] = [
    { id: "1", answers: answers({ nps: 10, extra: { canales: ["Web"] } }) },
    {
      id: "2",
      answers: answers({
        nps: 9,
        sus: [4, 2, 4, 1, 5, 2, 4, 2, 4, 2],
        extra: { frecuencia: "Mensual", canales: ["Web", "App"] },
      }),
    },
    { id: "3", answers: answers({ nps: 3, extra: { frecuencia: "Mensual" } }) },
    { id: "4", excluded: true, answers: answers({ nps: 0 }) },
  ];

  it("las respuestas excluidas no entran, pero cuentan en el total", () => {
    const agg = computeSurveyAggregates(config, responses);
    expect(agg.nTotal).toBe(4);
    expect(agg.nIncluded).toBe(3);
  });

  it("NPS del ejemplo: 2 promotores y 1 detractor de 3 → 33,3", () => {
    const nps = computeSurveyAggregates(config, responses).instruments.find(
      (i) => i.instrument === "nps",
    );
    expect(nps?.instrument === "nps" && nps.summary?.nps).toBeCloseTo(
      33.333,
      2,
    );
  });

  it("SUS: media de 100, 80 y 100 = 93,33, con referencia de 68", () => {
    const sus = computeSurveyAggregates(config, responses).instruments.find(
      (i) => i.instrument === "sus",
    );
    expect(sus?.instrument).toBe("sus");
    if (sus?.instrument === "sus") {
      expect(sus.n).toBe(3);
      expect(sus.summary?.mean).toBeCloseTo(93.333, 2);
      expect(sus.benchmark).toBe(68);
    }
  });

  it("opción única y múltiple: conteos y proporciones sobre quienes respondieron", () => {
    const items = computeSurveyAggregates(config, responses).items;
    const freq = items.find((i) => i.id === "frecuencia");
    expect(
      freq?.type === "select" &&
        freq.options.find((o) => o.option === "Mensual"),
    ).toMatchObject({ count: 2, pct: 2 / 3 });
    const canales = items.find((i) => i.id === "canales");
    // sólo 2 de 3 respondieron la pregunta opcional
    expect(canales).toMatchObject({ type: "multiselect", n: 2 });
    expect(
      canales?.type === "multiselect" &&
        canales.options.find((o) => o.option === "Web"),
    ).toMatchObject({ count: 2, pct: 1 });
  });

  it("los ítems de instrumentos no aparecen sueltos y los textos libres sólo se cuentan", () => {
    const items = computeSurveyAggregates(config, responses).items;
    expect(
      items.some((i) => i.id.startsWith("sus_") || i.id.startsWith("nps_")),
    ).toBe(false);
    expect(items.find((i) => i.id === "comentario")).toEqual({
      id: "comentario",
      label: "Comentarios",
      type: "text",
      n: 0,
    });
  });

  it("un instrumento incompleto no cuenta en su n", () => {
    const partial = responses.map((r) =>
      r.id === "3" ? { ...r, answers: { ...r.answers, sus_2: undefined } } : r,
    );
    const sus = computeSurveyAggregates(config, partial).instruments.find(
      (i) => i.instrument === "sus",
    );
    expect(sus?.n).toBe(2);
  });

  it("sin respuestas no falla", () => {
    const agg = computeSurveyAggregates(config, []);
    expect(agg.nIncluded).toBe(0);
    expect(agg.instruments.every((i) => i.n === 0)).toBe(true);
  });
});

describe("desglose por grupo con supresión de grupos chicos", () => {
  const mk = (id: string, age?: string, excluded = false): SurveyResponse => ({
    id,
    excluded,
    answers: {},
    segments: age ? { age_range: age } : {},
  });
  const rs = [
    ...Array.from({ length: 6 }, (_, i) => mk(`a${i}`, "18-24")),
    ...Array.from({ length: 3 }, (_, i) => mk(`b${i}`, "25-34")),
    mk("x"),
    mk("y", "18-24", true),
  ];

  it("omite los grupos con menos de 5 respuestas e informa cuántos fueron", () => {
    const split = splitByGroup(rs, "age_range");
    expect(split.groups.map((g) => [g.value, g.responses.length])).toEqual([
      ["18-24", 6],
    ]);
    expect(split.suppressedGroups).toBe(1);
    expect(split.unclassified).toBe(1);
  });

  it("el umbral es configurable", () => {
    expect(splitByGroup(rs, "age_range", 3).groups.map((g) => g.value)).toEqual(
      ["18-24", "25-34"],
    );
  });
});
