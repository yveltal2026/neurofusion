// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({ generateStudyReport: generate }));
import { GenerateReportForm } from "./GenerateReportForm";
afterEach(cleanup);
beforeEach(() => { generate.mockReset(); });
describe("botón de análisis", () => {
  it("explica qué falta para generar el reporte sin ocultar el botón", () => {
    render(
      <GenerateReportForm
        studyId="study"
        ready={false}
        reason="Faltan respuestas"
        hasReport={false}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Analizar con IA",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Faltan respuestas")).toBeTruthy();
  });
  it("muestra actividad mientras genera y un error que permite reintentar", async () => {
    const user = userEvent.setup();
    let finish!: (value: { error: string }) => void;
    generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <GenerateReportForm studyId="study" ready reason="" hasReport={false} />,
    );
    await user.click(screen.getByRole("button", { name: "Analizar con IA" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Elaborando reporte…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    finish({ error: "Proveedor no disponible" });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Proveedor no disponible",
      ),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Analizar con IA",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
