// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProjectList } from "./project-list";

afterEach(cleanup);

const PROJECTS = [
  {
    id: "p1",
    name: "Campaña Verano",
    description: "Pruebas de empaque y anuncios",
    created_at: "2026-11-10T12:00:00Z",
    studyCount: 3,
  },
  {
    id: "p2",
    name: "Sitio Admisiones",
    description: "Auditoría SEO y recorrido",
    created_at: "2026-11-12T12:00:00Z",
    studyCount: 1,
  },
];

it("muestra conteos de estudios y filtra proyectos desde el buscador", () => {
  render(<ProjectList projects={PROJECTS} />);

  expect(screen.getByText("3 estudios")).toBeTruthy();
  expect(screen.getByText("1 estudio")).toBeTruthy();
  expect(screen.getByText("2 proyectos")).toBeTruthy();

  const search = screen.getByRole("searchbox", {
    name: "Buscar proyecto por nombre o descripción",
  });
  fireEvent.change(search, { target: { value: "admisiones" } });

  expect(screen.queryByText("Campaña Verano")).toBeNull();
  expect(screen.getByText("Sitio Admisiones")).toBeTruthy();
  expect(screen.getByText("1 de 2 proyectos")).toBeTruthy();
});
