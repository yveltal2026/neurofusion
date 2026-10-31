// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { QuestionImage } from "./QuestionImage";

afterEach(cleanup);
it("muestra la descripción y permite reintentar una descarga fallida", async () => {
  const user = userEvent.setup();
  render(<QuestionImage src="/api/s/token/survey/images/q1" alt="Envase azul" />);
  fireEvent.error(screen.getByAltText("Envase azul"));
  expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar");
  await user.click(screen.getByRole("button", { name: "Reintentar imagen" }));
  expect(screen.getByAltText("Envase azul").getAttribute("src")).toBe("/api/s/token/survey/images/q1?retry=1");
});
