// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudyTabs } from "./study-tabs";
afterEach(cleanup);
it("ofrece un informe canónico de encuesta y conserva las vistas especializadas de cada herramienta", () => {
  const { rerender } = render(<StudyTabs id="study" variant="survey" active="report" />);
  expect(screen.getByRole("link", { name: "Informe y resultados" }).getAttribute("href")).toBe("/studies/study/report");
  expect(screen.getByRole("link", { name: "Informe y resultados" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByRole("link", { name: "Resultados" })).toBeNull();
  rerender(<StudyTabs id="study" variant="eye" active="report" />);
  expect(screen.getByRole("link", { name: "Informe" }).getAttribute("href")).toBe("/studies/study/report");
  expect(screen.getByRole("link", { name: "Miradas" }).getAttribute("href")).toBe("/studies/study/eye");
  rerender(<StudyTabs id="study" variant="pieces" active="report" />);
  expect(screen.getByRole("link", { name: "Informe" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Comparativa" })).toBeTruthy();
});
