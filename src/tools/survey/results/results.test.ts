import { describe, expect, it } from "vitest";
import {
  DEFAULT_THANK_YOU,
  defaultConsentText,
  instrumentItemId,
  type SurveyConfig,
} from "../engine";
import { surveyCsv } from "./csv";
import {
  joinSurveyRecords,
  type SurveyRecord,
  type SurveySessionRow,
} from "./load";

const config: SurveyConfig = {
  version: 1,
  title: "Prueba",
  texts: { consent: defaultConsentText("Prueba"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [
        {
          type: "select",
          id: "frecuencia",
          prompt: "Frecuencia",
          required: true,
          options: ["Semanal", "Mensual"],
        },
        {
          type: "multiselect",
          id: "canales",
          prompt: "Canales",
          required: false,
          options: ["Web", "App", "Tienda física"],
        },
        {
          type: "likert",
          id: "confianza",
          prompt: "Confianza",
          required: true,
          points: 5,
        },
        {
          type: "text",
          id: "comentario",
          prompt: "Comentarios",
          required: false,
        },
      ],
    },
    { kind: "instrument", id: "sus", instrumentId: "sus", required: true },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
    {
      kind: "instrument",
      id: "pi",
      instrumentId: "purchase_intent",
      required: true,
    },
    { kind: "instrument", id: "sam", instrumentId: "sam", required: true },
    { kind: "instrument", id: "att", instrumentId: "attitude", required: true },
  ],
};

function answers(extra: Record<string, unknown> = {}) {
  const a: Record<string, unknown> = {
    frecuencia: "Semanal",
    confianza: 4,
    nps_1: 9,
    pi_1: 5,
    sam_1: 7,
    sam_2: 3,
    sam_3: 5,
    att_1: 7,
    att_2: 6,
    att_3: 5,
    ...extra,
  };
  [5, 1, 5, 1, 5, 1, 5, 1, 5, 1].forEach((v, i) => {
    a[instrumentItemId("sus", i + 1)] = v;
  });
  return a;
}

const session = (
  id: string,
  over: Partial<SurveySessionRow> = {},
): SurveySessionRow => ({
  id,
  participant_ref: `ref-${id}`,
  status: "completed",
  excluded: false,
  excluded_reason: null,
  device_type: "mobile",
  started_at: "2026-10-14T10:00:00Z",
  completed_at: "2026-10-14T10:05:00Z",
  ...over,
});

describe("unión de sesiones y respuestas", () => {
  it("sólo incluye sesiones completadas con respuestas guardadas", () => {
    const sessions = [
      session("a"),
      session("b", { status: "started" }),
      session("c", { status: "abandoned" }),
      session("d"),
    ];
    const records = joinSurveyRecords(sessions, [
      { session_id: "a", answers: { x: 1 } },
      { session_id: "b", answers: { x: 2 } },
      { session_id: "c", answers: { x: 3 } },
    ]);
    expect(records.map((r) => r.id)).toEqual(["a"]); // d no tiene respuestas
    expect(records[0]).toMatchObject({
      participantRef: "ref-a",
      deviceType: "mobile",
      excluded: false,
      answers: { x: 1 },
    });
  });

  it("ignora respuestas que no son un objeto y ordena de la más reciente a la más antigua", () => {
    const records = joinSurveyRecords(
      [
        session("a", { started_at: "2026-10-01T00:00:00Z" }),
        session("b", { started_at: "2026-10-03T00:00:00Z" }),
        session("c"),
      ],
      [
        { session_id: "a", answers: {} },
        { session_id: "b", answers: {} },
        { session_id: "c", answers: "no soy un objeto" },
      ],
    );
    expect(records.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("conserva la exclusión y su motivo", () => {
    const [r] = joinSurveyRecords(
      [session("a", { excluded: true, excluded_reason: "duplicado" })],
      [{ session_id: "a", answers: {} }],
    );
    expect(r).toMatchObject({ excluded: true, excludedReason: "duplicado" });
  });
});

describe("CSV de respuestas", () => {
  const rec = (
    id: string,
    a: Record<string, unknown>,
    over: Partial<SurveyRecord> = {},
  ): SurveyRecord => ({
    id,
    participantRef: `ref-${id}`,
    deviceType: "desktop",
    startedAt: "2026-10-14T10:00:00Z",
    completedAt: "2026-10-14T10:05:00Z",
    excluded: false,
    excludedReason: null,
    answers: a,
    ...over,
  });

  function parse(csv: string) {
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    const header = lines[0]!.split(",");
    return {
      header,
      rows: lines
        .slice(1)
        .map((l) =>
          Object.fromEntries(l.split(",").map((v, i) => [header[i], v])),
        ),
    };
  }

  it("encabezados: metadatos, un campo por elemento, una columna 0/1 por opción y puntuaciones", () => {
    const { header } = parse(surveyCsv(config, []));
    expect(header.slice(0, 6)).toEqual([
      "participant_ref",
      "started_at",
      "completed_at",
      "device_type",
      "excluded",
      "excluded_reason",
    ]);
    expect(header).toEqual(
      expect.arrayContaining([
        "frecuencia",
        "canales_web",
        "canales_app",
        "canales_tienda_fisica",
        "confianza",
        "comentario",
      ]),
    );
    expect(header).toEqual(
      expect.arrayContaining([
        "sus_1",
        "sus_10",
        "sus_score",
        "nps_1",
        "nps_category",
        "pi_top2box",
        "sam_1",
        "sam_3",
        "att_score",
      ]),
    );
    expect(header).not.toContain("canales");
    expect(header).not.toContain("sam_score");
  });

  it("valores: opciones múltiples 0/1, puntuaciones calculadas por el motor", () => {
    const csv = surveyCsv(config, [
      rec(
        "1",
        answers({ canales: ["Web", "Tienda física"], comentario: "bien" }),
      ),
    ]);
    const { rows } = parse(csv);
    expect(rows[0]).toMatchObject({
      participant_ref: "ref-1",
      frecuencia: "Semanal",
      canales_web: "1",
      canales_app: "0",
      canales_tienda_fisica: "1",
      confianza: "4",
      comentario: "bien",
      sus_score: "100",
      nps_category: "promoter",
      pi_top2box: "1",
      att_score: "6",
      excluded: "0",
    });
  });

  it("una opción múltiple sin responder deja vacías las columnas (no las llena de ceros)", () => {
    const { rows } = parse(surveyCsv(config, [rec("1", answers())]));
    expect(rows[0]).toMatchObject({
      canales_web: "",
      canales_app: "",
      canales_tienda_fisica: "",
    });
  });

  it("las excluidas se incluyen marcadas; un instrumento incompleto queda sin puntuación", () => {
    const incomplete = answers();
    delete incomplete.sus_4;
    const { rows } = parse(
      surveyCsv(config, [
        rec("1", answers(), { excluded: true, excludedReason: "duplicado" }),
        rec("2", incomplete),
      ]),
    );
    expect(rows[0]).toMatchObject({
      excluded: "1",
      excluded_reason: "duplicado",
      sus_score: "100",
    });
    expect(rows[1]).toMatchObject({ excluded: "0", sus_score: "", sus_4: "" });
  });

  it("neutraliza fórmulas en textos libres", () => {
    const csv = surveyCsv(config, [
      rec("1", answers({ comentario: '=HYPERLINK("http://x")' })),
    ]);
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("escapa comas y comillas en textos libres", () => {
    const csv = surveyCsv(config, [
      rec("1", answers({ comentario: 'dijo "hola", y se fue' })),
    ]);
    expect(csv).toContain('"dijo ""hola"", y se fue"');
  });
});
