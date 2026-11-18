// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  row: null as unknown,
  urls: {} as Record<string, string>,
  visual: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: mocks.row }),
        };
        return query;
      },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/tools/visual/load", () => ({
  loadVisualStudyPage: mocks.visual,
}));

vi.mock("@/tools/visual/results", () => ({
  assetUrls: async () => mocks.urls,
  toVisualAsset: (row: { id: string; title: string; aois?: unknown; ai?: unknown; metrics?: unknown }) => ({
    row,
    aois: (row.aois as unknown[]) ?? [],
    ai: row.ai ?? null,
    metrics: row.metrics ?? null,
  }),
}));

vi.mock("@/tools/visual/actions", () => ({
  deleteAsset: vi.fn(),
  restoreAiAois: vi.fn(),
  analyzeAsset: vi.fn(),
  updateAssetMeta: vi.fn(),
  saveAois: vi.fn(),
}));

import AssetPage from "./page";
import { render, screen } from "@testing-library/react";

const studyId = "s-12345678-1234-1234-1234-1234567890ab";
const assetId = "a-12345678-1234-1234-1234-1234567890ab";
const props = { params: Promise.resolve({ id: studyId, assetId }) } as Parameters<typeof AssetPage>[0];

const fakeAiResult = {
  summary: "Pieza publicitaria con alto contraste y llamada a la acción clara.",
  message: "Promoción de posgrados universitarios",
  firstSeconds: "La mirada se dirige de inmediato al titular superior.",
  criteria: {
    clarity: { score: 4, evidence: "Mensaje directo y comprensible." },
    hierarchy: { score: 4, evidence: "Titular prominente." },
    cta: { score: 5, evidence: "Botón con color de acento." },
    legibility: { score: 4, evidence: "Texto con buen tamaño." },
    brand: { score: 4, evidence: "Logotipo visible en esquina." },
    load: { score: 4, evidence: "Espacio negativo adecuado." },
  },
  issues: [
    { severity: "medium" as const, problem: "Texto legal pequeño", recommendation: "Aumentar a 10 pt" },
  ],
  strengths: ["Llamada a la acción contrastada"],
  limitations: ["No evalúa contexto de visualización móvil"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.visual.mockResolvedValue({
    study: { id: studyId, name: "Estudio Gráfico", tool_type: "visual" },
    config: { mode: "pieces", objective: "Evaluar piezas", brand: "Anáhuac", audience: "Estudiantes" },
    projectName: "Campaña 2026",
  });
  mocks.row = {
    id: assetId,
    study_id: studyId,
    title: "Póster Posgrados 2027",
    file_name: "poster.png",
    storage_path: `${studyId}/${assetId}.png`,
    width: 2700,
    height: 3600,
    bytes: 4_500_000,
    sha256: "abcdef1234567890",
    placement: "print_poster_18x24",
    aois_source: "ai",
    created_at: new Date().toISOString(),
    ai: {
      generatedAt: new Date().toISOString(),
      provider: "mock",
      model: "mock-vision",
      engineVersion: "nf-ai-1.0",
      tiles: 1,
      coverage: 1,
      result: fakeAiResult,
    },
    metrics: {
      version: "nf-img-1.0",
      rmsContrast: 0.35,
      edgeDensity: 0.18,
      negativeSpace: 0.42,
      colorfulness: 38,
      meanLuminance: 0.55,
      palette: [{ hex: "#ffffff", share: 0.4 }, { hex: "#ff5900", share: 0.2 }],
      textContrast: [{ id: "t1", label: "Titular", ratio: 12.5 }],
    },
  };
  mocks.urls = { [`${studyId}/${assetId}.png`]: "https://storage.local/view.png" };
});

describe("AssetPage · vista rediseñada con pestañas", () => {
  it("renderiza el encabezado limpio, el visor, y las 4 pestañas de contenido", async () => {
    const vnode = await AssetPage(props);
    render(vnode);

    // Título y chips de estado
    expect(screen.getByRole("heading", { level: 1, name: "Póster Posgrados 2027" })).toBeTruthy();
    expect(screen.getAllByText("Póster · 18×24 in (46×61 cm)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Cumple formato")).toBeTruthy();
    expect(screen.getByText("Analizada con IA")).toBeTruthy();

    // Las 4 pestañas accesibles en control segmentado
    expect(screen.getByRole("tab", { name: /Diagnóstico/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Atención/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Formato/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Edición/ })).toBeTruthy();

    // El calificador rápido de criterios va arriba con su promedio
    expect(screen.getByText("Calificación por criterio")).toBeTruthy();
    expect(screen.getByText("4.2")).toBeTruthy();
    expect(screen.getByText("/ 5 promedio")).toBeTruthy();
    expect(screen.getByText("Claridad del mensaje")).toBeTruthy();
    expect(screen.getByText("Visibilidad de la acción")).toBeTruthy();

    // La lectura de la IA
    expect(screen.getByText("Pieza publicitaria con alto contraste y llamada a la acción clara.")).toBeTruthy();
  });
});
