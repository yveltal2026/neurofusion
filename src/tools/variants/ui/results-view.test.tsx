// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Recharts necesita medidas de layout que jsdom no tiene: la gráfica se prueba aparte.
vi.mock("@/components/charts/variant-charts", () => ({ VariantHistogram: ({ rows }: { rows: unknown[] }) => <div data-testid="histogram">{rows.length} clases</div> }));

import { validVariantConfig } from "../defaults";
import { computeVariantAggregates } from "../results/aggregate";
import { alwaysLeft, recordFor, scBehaviour } from "../test-utils";
import { VariantResultsView } from "./results-view";

afterEach(cleanup);

const sc = validVariantConfig("sc_iat");

describe("VariantResultsView", () => {
  it("sin participantes enseña el siguiente paso", () => {
    render(<VariantResultsView config={sc} aggregates={computeVariantAggregates(sc, [])} />);
    expect(screen.getByText("Aún no hay participantes")).toBeTruthy();
  });

  it("muestra el resultado, la lectura del signo y las advertencias de calidad con su motivo", () => {
    const records = [recordFor(sc, scBehaviour(600, 800)), recordFor(sc, scBehaviour(610, 810)), recordFor(sc, scBehaviour(590, 790)), recordFor(sc, alwaysLeft)];
    render(<VariantResultsView config={sc} aggregates={computeVariantAggregates(sc, records)} />);
    expect(screen.getByText(/Resultado principal · SC-IAT/)).toBeTruthy();
    expect(screen.getByText(/D > 0: «Marca A» se asocia más rápido con «Bueno»/)).toBeTruthy();
    expect(screen.getByText(/1 con advertencias/)).toBeTruthy();
    expect(screen.getByText(/Muchos errores/)).toBeTruthy();
    expect(screen.getByText(/Con menos de 30 participantes/)).toBeTruthy();
    expect(screen.getByTestId("histogram")).toBeTruthy();
    expect(screen.getByText(/no se han cotejado contra los datos de las publicaciones originales/)).toBeTruthy();
  });

  it("si nadie tiene advertencias, lo dice con texto (no sólo color)", () => {
    const records = [recordFor(sc, scBehaviour(600, 800)), recordFor(sc, scBehaviour(610, 810))];
    render(<VariantResultsView config={sc} aggregates={computeVariantAggregates(sc, records)} />);
    expect(screen.getByText("Sin advertencias")).toBeTruthy();
  });

  it("con un solo participante explica por qué no hay intervalo", () => {
    const records = [recordFor(sc, scBehaviour(600, 800))];
    render(<VariantResultsView config={sc} aggregates={computeVariantAggregates(sc, records)} />);
    expect(screen.getByText(/al menos 2 participantes sin advertencias/)).toBeTruthy();
  });

  it("GNAT y priming con dos conceptos explican el contraste", () => {
    const g = validVariantConfig("gnat", 2);
    const gr = recordFor(g, ({ trial }) => ((trial as { signal: boolean }).signal ? { key: "go", rtMs: 450 } : { key: null, rtMs: null }));
    const { unmount } = render(<VariantResultsView config={g} aggregates={computeVariantAggregates(g, [gr, gr])} />);
    expect(screen.getByText(/Contraste de «Marca A» menos el de «Marca B»/)).toBeTruthy();
    unmount();
    const p = validVariantConfig("priming");
    const pr = recordFor(p, ({ trial }) => ({ key: (trial as { correctSide: "left" | "right" }).correctSide, rtMs: 600 }));
    render(<VariantResultsView config={p} aggregates={computeVariantAggregates(p, [pr])} />);
    expect(screen.getByText(/menos esa misma ventaja tras el prime de control/)).toBeTruthy();
  });
});
