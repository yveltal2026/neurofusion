// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultConsentText,
  DEFAULT_THANK_YOU,
  instrumentItemId,
  type SurveyConfig,
} from "@/tools/survey/engine";
import {
  buildBatteryReport,
  type ReportParticipant,
  type ReportStep,
} from "../report";
import { ReportView } from "./ReportView";

afterEach(cleanup);

const config: SurveyConfig = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};
const steps: ReportStep[] = [
  {
    kind: "iat",
    studyId: "i",
    name: "IAT café",
    conceptA: "Marca A",
    conceptB: "Marca B",
    dimensions: [{ id: "c", name: "Calidad", positiveLabel: "Confiable" }],
  },
  { kind: "survey", studyId: "s", name: "Encuesta de marca", config },
];
const NPS = [0, 1, 3, 2, 5, 4, 7, 6, 9, 8, 10, 10];
const people = (n: number): ReportParticipant[] =>
  NPS.slice(0, n).map((v, i) => ({
    id: `b${i}`,
    ref: `r${i}`,
    excluded: false,
    iat: { i: [{ d: -0.6 + i * 0.1, valid: true }] },
    survey: { s: { [instrumentItemId("nps", 1)]: v } },
  }));

describe("ReportView", () => {
  it("con datos suficientes muestra IAT (medido), encuesta (medido) y cruces (estimado)", () => {
    const report = buildBatteryReport(steps, people(12));
    render(<ReportView report={report} steps={steps} unreadable={[]} />);
    expect(screen.getByText("Medidas implícitas (IAT)")).toBeTruthy();
    expect(screen.getByText("Encuesta · Encuesta de marca")).toBeTruthy();
    expect(
      screen.getByText("Cruces entre lo implícito y lo declarado"),
    ).toBeTruthy();
    expect(screen.getAllByText("medido").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("estimado")).toBeTruthy();
    expect(screen.getByText("Exploratoria")).toBeTruthy();
    expect(screen.getByText("ρ de Spearman")).toBeTruthy();
    expect(screen.getAllByText(/IAT café · Calidad/).length).toBe(2); // fila del IAT + fila del cruce
  });

  it("con pocos participantes explica por qué no hay cruces en lugar de inventarlos", () => {
    const report = buildBatteryReport(steps, people(6));
    render(<ReportView report={report} steps={steps} unreadable={[]} />);
    expect(screen.queryByText("ρ de Spearman")).toBeNull();
    expect(screen.getByText(/al menos\s+10 participantes/)).toBeTruthy();
    expect(screen.getByText(/1 cruce no calculado/)).toBeTruthy();
    expect(
      screen.getByText(/solo 6 participantes con ambos datos/),
    ).toBeTruthy();
  });

  it("sin participantes lo dice, y avisa de pasos ilegibles", () => {
    const report = buildBatteryReport(steps, []);
    render(
      <ReportView report={report} steps={steps} unreadable={["IAT roto"]} />,
    );
    expect(
      screen.getByText(/Aún no hay participantes que hayan terminado/),
    ).toBeTruthy();
    expect(screen.getByText(/IAT roto/)).toBeTruthy();
  });
});
