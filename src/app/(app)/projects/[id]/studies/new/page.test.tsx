// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  project: { id: "p-123", name: "Proyecto Anáhuac" } as unknown,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mocks.project }),
          }),
        }),
      }),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import NewStudyPage from "./page";

const props = { params: Promise.resolve({ id: "p-123" }) } as Parameters<typeof NewStudyPage>[0];

describe("NewStudyPage · selección de herramientas con cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project = { id: "p-123", name: "Proyecto Anáhuac" };
  });

  it("renderiza las cards de cada tipo de estudio en lugar de listados", async () => {
    const vnode = await NewStudyPage(props);
    render(vnode);

    // Título y encabezado
    expect(screen.getByRole("heading", { level: 1, name: "¿Qué quieres saber?" })).toBeTruthy();
    expect(screen.getByText("Proyecto Anáhuac")).toBeTruthy();

    // Categorías
    expect(screen.getByText("Atención visual")).toBeTruthy();
    expect(screen.getByText("Asociaciones implícitas")).toBeTruthy();
    expect(screen.getByText("Percepción y opinión")).toBeTruthy();
    expect(screen.getByText("Diagnóstico digital")).toBeTruthy();
    expect(screen.getByText("Crear una batería")).toBeTruthy();

    // Cards individuales de estudios
    expect(screen.getByText("Eye tracking con webcam")).toBeTruthy();

    expect(screen.getByText("Análisis visual con IA")).toBeTruthy();
    expect(screen.getAllByText("Estimado").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Test de Asociación Implícita (IAT)")).toBeTruthy();
    expect(screen.getByText("Variantes del IAT (SC-IAT, Go/No-Go, priming)")).toBeTruthy();

    expect(screen.getByText("Encuesta")).toBeTruthy();
    expect(screen.getByText("Auditoría SEO")).toBeTruthy();
    expect(screen.getByText("Análisis de Imagen Web")).toBeTruthy();
    expect(screen.getByText("Eyetracking para Web")).toBeTruthy();

    // Card de combinación (batería)
    expect(screen.getByText("Armar batería")).toBeTruthy();

    // Verifica que los enlaces a las rutas de configuración existan
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/projects/p-123/studies/new/eyetracking");
    expect(hrefs).toContain("/projects/p-123/studies/new/visual");
    expect(hrefs).toContain("/projects/p-123/studies/new/web-visual");
    expect(hrefs).toContain("/projects/p-123/studies/new/web-eyetracking");
    expect(hrefs).toContain("/projects/p-123/studies/new/iat");
    expect(hrefs).toContain("/projects/p-123/studies/new/variants");
    expect(hrefs).toContain("/projects/p-123/studies/new/survey");
    expect(hrefs).toContain("/projects/p-123/studies/new/seo");
    expect(hrefs).toContain("/projects/p-123/batteries/new");
  });

  it("dispara notFound si el proyecto no existe", async () => {
    mocks.project = null;
    await expect(NewStudyPage(props)).rejects.toThrow("NOT_FOUND");
  });
});
