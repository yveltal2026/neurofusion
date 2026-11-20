// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudyGallery, type StudyGalleryItem } from "./study-gallery";

afterEach(cleanup);

const STUDIES: StudyGalleryItem[] = [
  {
    id: "s1",
    name: "Empaque de jugo A frente a B",
    tool_type: "iat",
    config: {},
    status: "published",
    created_at: "2026-11-10T12:00:00Z",
  },
  {
    id: "s2",
    name: "Creatividades de temporada",
    tool_type: "visual",
    config: { mode: "pieces" },
    status: "draft",
    created_at: "2026-11-11T12:00:00Z",
  },
  {
    id: "s3",
    name: "Sitio de admisiones",
    tool_type: "seo",
    config: {},
    status: "closed",
    created_at: "2026-11-12T12:00:00Z",
  },
];

it("filtra estudios por estado, herramienta y búsqueda y expone acciones directas", () => {
  render(<StudyGallery studies={STUDIES} />);

  expect(screen.getByRole("link", { name: "Análisis" }).getAttribute("href")).toBe("/studies/s1/analysis");
  expect(screen.getByRole("link", { name: "Ver informe" }).getAttribute("href")).toBe("/studies/s2/report");

  fireEvent.click(screen.getByRole("button", { name: "Publicados" }));
  expect(screen.getByText("Empaque de jugo A frente a B")).toBeTruthy();
  expect(screen.queryByText("Creatividades de temporada")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Todos" }));
  fireEvent.click(screen.getByRole("button", { name: "SEO" }));
  expect(screen.getByText("Sitio de admisiones")).toBeTruthy();
  expect(screen.queryByText("Empaque de jugo A frente a B")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Todas las herramientas" }));
  const search = screen.getByRole("searchbox", {
    name: "Buscar estudio por nombre o herramienta",
  });
  fireEvent.change(search, { target: { value: "temporada" } });
  expect(screen.getByText("Creatividades de temporada")).toBeTruthy();
  expect(screen.queryByText("Sitio de admisiones")).toBeNull();
});
