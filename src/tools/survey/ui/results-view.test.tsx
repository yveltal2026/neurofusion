// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeSurveyAggregates,
  DEFAULT_THANK_YOU,
  defaultConsentText,
  instrumentItemId,
  type SurveyConfig,
  type SurveyResponse,
} from "../engine";
import { SurveyResultsView } from "./results-view";

afterEach(cleanup);

const config: SurveyConfig = {
  version: 1,
  title: "Tienda",
  texts: { consent: defaultConsentText("Tienda"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [
        {
          type: "select",
          id: "frecuencia",
          prompt: "¿Con qué frecuencia compras?",
          required: true,
          options: ["Semanal", "Mensual"],
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
      subject: "esta tienda",
      required: true,
    },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
    {
      kind: "instrument",
      id: "pi",
      instrumentId: "purchase_intent",
      required: true,
    },
  ],
};

function response(
  id: string,
  sus: number[],
  nps: number,
  pi: number,
  extra: Record<string, unknown> = {},
): SurveyResponse {
  const answers: Record<string, unknown> = {
    frecuencia: id === "3" ? "Mensual" : "Semanal",
    nps_1: nps,
    pi_1: pi,
    ...extra,
  };
  sus.forEach((v, i) => {
    answers[instrumentItemId("sus", i + 1)] = v;
  });
  return { id, answers };
}

const best = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
const mid = [4, 2, 4, 1, 5, 2, 4, 2, 4, 2]; // 80

describe("SurveyResultsView", () => {
  it("sin respuestas: lo dice y no inventa cifras", () => {
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, [])}
      />,
    );
    expect(screen.getByText(/Aún no hay respuestas completas/)).toBeTruthy();
    expect(screen.getByText("Sin respuestas completas.")).toBeTruthy();
  });

  it("muestra SUS, NPS y la intención con sus intervalos y la referencia", () => {
    const rs = [
      response("1", best, 10, 5),
      response("2", mid, 9, 4),
      response("3", best, 3, 2, {
        comentario: "texto secreto del participante",
      }),
    ];
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, rs)}
      />,
    );

    // SUS: (100 + 80 + 100) / 3 = 93.3 con referencia 68.
    expect(screen.getByText("93.3")).toBeTruthy();
    expect(screen.getByText("68")).toBeTruthy();
    expect(screen.getByText(/Escala de Usabilidad del Sistema/)).toBeTruthy();
    expect(screen.getByText(/esta tienda/, { selector: "span" })).toBeTruthy();
    // NPS: 2 promotores y 1 detractor de 3 → 33.
    expect(screen.getByText("33")).toBeTruthy();
    expect(screen.getByText("Promotores (9–10)")).toBeTruthy();
    // Intención: 2 de 3 en las dos categorías superiores → 67 %.
    expect(screen.getByText("67 %")).toBeTruthy();
    expect(
      screen.getAllByText(/no es un pronóstico de ventas/).length,
    ).toBeGreaterThan(0);
    // Opción única.
    expect(screen.getByText("Mensual")).toBeTruthy();
  });

  it("advierte de la muestra pequeña y de la evidencia", () => {
    const rs = [response("1", best, 10, 5), response("2", mid, 9, 4)];
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, rs)}
      />,
    );
    expect(screen.getByText(/Muestra pequeña \(2 respuestas\)/)).toBeTruthy();
    expect(
      screen.getAllByText(/evidencia: autorreporte medido/).length,
    ).toBeGreaterThan(0);
  });

  it("no muestra la advertencia con 30 o más respuestas", () => {
    const rs = Array.from({ length: 30 }, (_, i) =>
      response(String(i + 10), best, 9, 4),
    );
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, rs)}
      />,
    );
    expect(screen.queryByText(/Muestra pequeña/)).toBeNull();
  });

  it("los textos libres no se muestran: sólo se cuentan", () => {
    const rs = [
      response("1", best, 10, 5, {
        comentario: "texto secreto del participante",
      }),
    ];
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, rs)}
      />,
    );
    expect(screen.queryByText(/texto secreto/)).toBeNull();
    expect(screen.getByText(/1 respuestas escritas/)).toBeTruthy();
  });

  it("cuenta las excluidas aparte", () => {
    const rs = [
      response("1", best, 10, 5),
      { ...response("2", best, 10, 5), excluded: true },
    ];
    render(
      <SurveyResultsView
        config={config}
        aggregates={computeSurveyAggregates(config, rs)}
      />,
    );
    expect(screen.getByText("Excluidas").nextElementSibling?.textContent).toBe(
      "1",
    );
    expect(
      screen.getByText("Respuestas en el análisis").nextElementSibling
        ?.textContent,
    ).toBe("1");
  });
});
