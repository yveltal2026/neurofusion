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
    max_responses: 60,
    metricCount: 42,
    created_at: "2026-11-10T12:00:00Z",
  },
  {
    id: "s2",
    name: "Creatividades de temporada",
    tool_type: "visual",
    config: { mode: "pieces" },
    status: "draft",
    metricCount: 4,
    created_at: "2026-11-11T12:00:00Z",
  },
  {
    id: "s3",
    name: "Sitio de admisiones",
    tool_type: "seo",
    config: {},
    status: "closed",
    metricCount: 2,
    created_at: "2026-11-12T12:00:00Z",
  },
];

it("muestra métricas reales y filtra estudios por estado y búsqueda", () => {
  render(<StudyGallery studies={STUDIES} />);

  expect(screen.getByText("42 de 60 participantes")).toBeTruthy();
  expect(screen.getByText("4 piezas")).toBeTruthy();
  expect(screen.getByText("2 auditorías")).toBeTruthy();

  const link = screen.getByRole("link", { name: /Empaque de jugo A frente a B/i });
  expect(link.getAttribute("href")).toBe("/studies/s1");

  fireEvent.click(screen.getByRole("button", { name: "Publicados" }));
  expect(screen.getByText("Empaque de jugo A frente a B")).toBeTruthy();
  expect(screen.queryByText("Creatividades de temporada")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Todos" }));
  const search = screen.getByRole("searchbox", {
    name: "Buscar estudio por nombre o herramienta",
  });
  fireEvent.change(search, { target: { value: "temporada" } });
  expect(screen.getByText("Creatividades de temporada")).toBeTruthy();
  expect(screen.queryByText("Sitio de admisiones")).toBeNull();
});
