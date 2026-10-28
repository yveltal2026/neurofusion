// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageTargetFields } from "./page-target-fields";
import {
  SeoAuditComparison,
  SeoExecutiveSummary,
  SeoPageDiagnostics,
} from "./diagnostic-view";
import { pageTargetsFromForm, seoConfigSchema } from "../config";
import { runUploadAudit } from "../crawl";
import { finding, summarize } from "../engine";
import type { SeoAudit } from "../results";
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
afterEach(cleanup);
const url = "https://demo.mx/a";
function audit(): SeoAudit {
  const config = seoConfigSchema.parse({
    siteUrl: "https://demo.mx/",
    pageTargets: [
      { url, keyword: "zapatos", goal: "Solicitar una cotización" },
    ],
  });
  return {
    ...runUploadAudit(
      config,
      [{ url, html: "<title>Zapatos</title><h1>Catálogo</h1>" }],
      () => 0,
    ),
    id: "audit",
    ai: null,
    createdAt: "2026-10-28T00:00:00Z",
  };
}
describe("diagnóstico SEO y objetivos", () => {
  it("permite quitar y añadir objetivos sin desalinear las URLs y sus valores", () => {
    const { container } = render(
      <form>
        <PageTargetFields
          targets={[
            { url, keyword: "a", goal: "Objetivo A", indexable: true },
            {
              url: "https://demo.mx/b",
              keyword: "b",
              goal: "Objetivo B",
              indexable: false,
            },
          ]}
        />
      </form>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar objetivo de la página 1" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir objetivo por URL" }),
    );
    fireEvent.change(screen.getByLabelText("URL objetivo 2"), {
      target: { value: "https://demo.mx/c" },
    });
    fireEvent.change(screen.getByLabelText("Palabra clave de la página 2"), {
      target: { value: "c" },
    });
    expect(
      pageTargetsFromForm(new FormData(container.querySelector("form")!)),
    ).toEqual([
      {
        url: "https://demo.mx/b",
        keyword: "b",
        goal: "Objetivo B",
        indexable: false,
      },
      { url: "https://demo.mx/c", keyword: "c", goal: "", indexable: true },
    ]);
  });
  it("muestra evidencia y alcance sin exigir un plan de IA", () => {
    render(<SeoExecutiveSummary audit={audit()} />);
    expect(
      screen.getByRole("heading", { name: "Aciertos comprobados" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Debilidades principales" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Qué corregir primero" }),
    ).toBeTruthy();
    expect(screen.getByText("HTML subido por el analista")).toBeTruthy();
    expect(screen.getByText(/no mide posiciones ni tráfico/)).toBeTruthy();
    expect(screen.getByText(/no restan puntos/)).toBeTruthy();
  });
  it("presenta el contexto histórico de cada página y las revisiones sin penalización", () => {
    const { container } = render(<SeoPageDiagnostics audit={audit()} />);
    expect(screen.getByText("Solicitar una cotización")).toBeTruthy();
    expect(screen.getByText("zapatos", { exact: true })).toBeTruthy();
    expect(container.querySelector("details summary")).toBeTruthy();
    expect(
      screen.getByText("Revisiones contextuales · sin penalización"),
    ).toBeTruthy();
  });
  it("no inventa objetivos para auditorías antiguas", () => {
    const old = audit();
    delete old.pages[0].target;
    delete old.summary.coverage;
    render(
      <>
        <SeoExecutiveSummary audit={old} />
        <SeoPageDiagnostics audit={old} />
      </>,
    );
    expect(screen.getByText("Sin objetivo específico guardado")).toBeTruthy();
    expect(screen.getByText(/anterior no guardó el desglose/)).toBeTruthy();
  });
  it("explica problemas resueltos y mantiene el enlace a la auditoría del mismo estudio", () => {
    const previous = audit();
    previous.findings = [finding("h1", "high", "Sin H1", url)];
    previous.summary = {
      ...previous.summary,
      ...summarize(previous.findings, 1),
    };
    const current = audit();
    current.findings = [finding("h1", "ok", "H1 corregido", url)];
    current.summary = { ...current.summary, ...summarize(current.findings, 1) };
    render(
      <SeoAuditComparison
        audit={current}
        previous={previous}
        studyId="study"
      />,
    );
    expect(screen.getAllByText("Resueltos comprobados")).toHaveLength(2);
    expect(screen.getByText(/Cambio de puntuación: \+75 puntos/)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/studies/study/audits/audit",
    );
  });
  it("advierte sobre cambios de versión y no anuncia una mejora de puntos", () => {
    const previous = audit();
    previous.engineVersion = "nf-seo-1.0";
    render(
      <SeoAuditComparison
        audit={audit()}
        previous={previous}
        studyId="study"
      />,
    );
    expect(screen.getByText(/Cambió el motor o la puntuación/)).toBeTruthy();
    expect(screen.queryByText(/Cambio de puntuación:/)).toBeNull();
  });
});
