// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ generateStudyReport: vi.fn() }));
import { StudyReportView } from "./StudyReportView";
import { VisualReportDashboard } from "./VisualReportDashboard";
import { AiReportPanel } from "./AiReportPanel";
import { eyeReportSnapshot, visualReportSnapshot } from "../model";
import { REPORT_VERSION } from "../schema";
import {
  asset,
  briefReport,
  eyeRecords,
  study,
  surveySource,
} from "../test-fixtures";
import type { SavedReport } from "../load";
afterEach(cleanup);
const saved: SavedReport = {
  id: "report",
  createdAt: "2026-10-31T00:00:00Z",
  provider: "fake",
  model: "test",
  result: {
    kind: "study_report",
    version: REPORT_VERSION,
    sourceKind: "survey",
    sourceHash: "a".repeat(64),
    report: briefReport,
  },
};

describe("informes", () => {
  it("reúne la encuesta completa, respuestas abiertas incluidas, CSV, PDF y botón de IA", () => {
    render(
      <StudyReportView
        study={study}
        projectName="Proyecto"
        source={surveySource()}
        sourceHash={"a".repeat(64)}
        saved={null}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Informe y resultados" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("button", { name: "Analizar con IA" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /guardar PDF/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Actualizar resultados" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Descargar CSV" }).getAttribute("href"),
    ).toContain("survey_responses");
    expect(
      screen.getByRole("heading", { name: /Comprarías este producto/ }),
    ).toBeTruthy();
    expect(screen.getByText("PRIVATE_TEXT_0")).toBeTruthy();
    expect(screen.queryByText("EXCLUDED_SECRET")).toBeNull();
  });
  it("muestra el informe guardado y avisa si los resultados cambiaron", () => {
    render(
      <AiReportPanel
        studyId={study.id}
        snapshot={surveySource().snapshot}
        sourceHash={"b".repeat(64)}
        saved={saved}
      />,
    );
    expect(screen.getByText(briefReport.executiveSummary)).toBeTruthy();
    expect(screen.getByText(/Los resultados cambiaron/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Actualizar reporte con IA" }),
    ).toBeTruthy();
  });
  it("mantiene la visualización si no pudo cargarse el reporte de IA", () => {
    render(
      <StudyReportView
        study={study}
        projectName="Proyecto"
        source={surveySource()}
        sourceHash={"a".repeat(64)}
        saved={null}
        loadError="No se pudo cargar el reporte"
      />,
    );
    expect(screen.getByText("No se pudo cargar el reporte")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Comprarías este producto/ }),
    ).toBeTruthy();
  });
  it("presenta las métricas reales de eye tracking y separa precisión limitada y exclusiones", () => {
    const visual = asset();
    const source = {
      kind: "eye" as const,
      config: {
        mode: "pieces" as const,
        objective: "Objetivo",
        brand: "",
        audience: "",
        eyeTracking: { durationSeconds: 5 },
      },
      assets: [visual],
      snapshot: eyeReportSnapshot(
        "Miradas",
        "Objetivo",
        [visual],
        eyeRecords(),
      ),
    };
    render(
      <StudyReportView
        study={{ ...study, tool_type: "visual" }}
        projectName="Proyecto"
        source={source}
        sourceHash={"a".repeat(64)}
        saved={null}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Informe" })
        .getAttribute("aria-current"),
    ).toBe("page");
    const row = screen
      .getByRole("rowheader", { name: "Logotipo" })
      .closest("tr")!;
    expect(within(row).getAllByRole("cell")[0]!.textContent).toBe("100");
    expect(screen.getByText(/no demuestran comprensión/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /mapas de calor/ }).getAttribute("href"),
    ).toContain("/eye");
  });
  it("identifica estimaciones visuales y no da puntajes a piezas pendientes", () => {
    const pending = asset(false);
    pending.row.id = "pending";
    pending.row.title = "Pieza pendiente";
    render(
      <VisualReportDashboard
        studyId={study.id}
        snapshot={visualReportSnapshot("Piezas", "Objetivo", [
          asset(),
          pending,
        ])}
      />,
    );
    expect(screen.getByText(/sin participantes/)).toBeTruthy();
    expect(screen.getByText("Sin evaluación guardada")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Mejoras sugeridas por pieza" }),
    ).toBeTruthy();
  });
});
