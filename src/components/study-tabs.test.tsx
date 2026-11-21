// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudyTabs, studyTabForRoute, studyTabsVariant } from "./study-tabs";
afterEach(cleanup);
it("ofrece un informe canónico de encuesta y conserva las vistas especializadas de cada herramienta", () => {
  const { rerender } = render(<StudyTabs id="study" variant={studyTabsVariant({ tool_type: "survey", config: {} })} active={studyTabForRoute("report")} />);
  expect(screen.getByRole("link", { name: "Informe y resultados" }).getAttribute("href")).toBe("/studies/study/report");
  expect(screen.getByRole("link", { name: "Informe y resultados" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByRole("link", { name: "Resultados" })).toBeNull();
  rerender(<StudyTabs id="study" variant={studyTabsVariant({ tool_type: "visual", config: { mode: "pieces", eyeTracking: {} } })} active={studyTabForRoute("report")} />);
  expect(screen.getByRole("link", { name: "Informe" }).getAttribute("href")).toBe("/studies/study/report");
  expect(screen.getByRole("link", { name: "Informe" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Miradas" }).getAttribute("href")).toBe("/studies/study/eye");
  expect(screen.getByRole("link", { name: "Sesiones" }).getAttribute("href")).toBe("/studies/study/eye?view=sessions");
  const eyeLinks = screen.getAllByRole("link").map((l) => l.textContent?.trim());
  expect(eyeLinks).toEqual(["Resumen", "Miradas", "Sesiones", "Informe", "Ajustes"]);
  rerender(<StudyTabs id="study" variant="pieces" active="report" />);
  expect(screen.getByRole("link", { name: "Informe" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Comparativa" })).toBeTruthy();
});


it("selecciona la sección correcta al cambiar la vista o abrir una ruta de detalle", () => {
  const { rerender } = render(<StudyTabs id="study" variant="eye" active={studyTabForRoute("eye")} />);
  expect(screen.getByRole("link", { name: "Miradas", current: "page" })).toBeTruthy();
  rerender(<StudyTabs id="study" variant="eye" active={studyTabForRoute("eye", "sessions")} />);
  expect(screen.getByRole("link", { name: "Sesiones", current: "page" })).toBeTruthy();
  rerender(<StudyTabs id="study" variant="eye" active={studyTabForRoute("assets")} />);
  expect(screen.getByRole("link", { name: "Resumen", current: "page" })).toBeTruthy();
});
