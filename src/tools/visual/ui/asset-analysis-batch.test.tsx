// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssetAnalysisBatch } from "./asset-analysis-batch";
import type { VisualFormState } from "../actions";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), refresh: vi.fn() }));
vi.mock("../actions", () => ({ analyzeAsset: mocks.analyze }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
const assets = [1, 2, 3].map((n) => ({
  id: `asset-${n}`,
  title: `Pieza ${n}`,
  width: 1000,
  height: 500,
  analyzed: n === 3,
  reviewed: n === 3,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
function deferred() {
  let resolve!: (value: VisualFormState) => void;
  const promise = new Promise<VisualFormState>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("analiza sólo las imágenes seleccionadas, una a la vez y con progreso", async () => {
  const first = deferred();
  mocks.analyze
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue({ ok: true });
  render(<AssetAnalysisBatch studyId="study" assets={assets} />);
  click("Sólo sin analizar");
  click("Analizar seleccionadas (2)");
  await waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1));
  expect((mocks.analyze.mock.calls[0][1] as FormData).get("assetId")).toBe(
    "asset-1",
  );
  expect(
    screen.getByRole("status", { name: "Progreso del análisis por lote" })
      .textContent,
  ).toContain("Pieza 1");
  await act(async () => first.resolve({ ok: true }));
  await waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(2));
  expect((mocks.analyze.mock.calls[1][1] as FormData).get("assetId")).toBe(
    "asset-2",
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(
    screen.getByRole("status", { name: "Progreso del análisis por lote" })
      .textContent,
  ).toContain("2 análisis guardados");
});

it("un error no descarta los éxitos y permite seleccionar sólo las fallidas", async () => {
  mocks.analyze
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ error: "El proveedor falló" })
    .mockResolvedValueOnce({ ok: true });
  render(<AssetAnalysisBatch studyId="study" assets={assets} />);
  click("Seleccionar todas");
  click("Analizar seleccionadas (3)");
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByText("El proveedor falló")).toBeTruthy();
  expect(screen.getAllByText("Análisis guardado")).toHaveLength(2);
  click("Seleccionar fallidas (1)");
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Seleccionar Pieza 2",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Seleccionar Pieza 1",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

it("detiene después de la solicitud activa y permite seleccionar las pendientes", async () => {
  const request = deferred();
  mocks.analyze.mockReturnValueOnce(request.promise);
  render(<AssetAnalysisBatch studyId="study" assets={assets} />);
  click("Seleccionar todas");
  click("Analizar seleccionadas (3)");
  await waitFor(() => expect(mocks.analyze).toHaveBeenCalledOnce());
  click("Detener después de esta imagen");
  await act(async () => request.resolve({ ok: true }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.analyze).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("status", { name: "Progreso del análisis por lote" })
      .textContent,
  ).toContain("2 pendientes");
  click("Seleccionar pendientes (2)");
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Seleccionar Pieza 1",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

it("detiene el lote al agotar la cuota y no solicita las siguientes imágenes", async () => {
  mocks.analyze.mockResolvedValue({
    error: "Límite por hora",
    code: "rate_limit",
  });
  render(<AssetAnalysisBatch studyId="study" assets={assets} />);
  click("Seleccionar todas");
  click("Analizar seleccionadas (3)");
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.analyze).toHaveBeenCalledOnce();
  expect(screen.getByText("Límite por hora")).toBeTruthy();
});

it("no continúa enviando solicitudes al salir de la página", async () => {
  const request = deferred();
  mocks.analyze.mockReturnValueOnce(request.promise);
  const { unmount } = render(
    <AssetAnalysisBatch studyId="study" assets={assets} />,
  );
  click("Seleccionar todas");
  click("Analizar seleccionadas (3)");
  await waitFor(() => expect(mocks.analyze).toHaveBeenCalledOnce());
  unmount();
  await act(async () => request.resolve({ ok: true }));
  expect(mocks.analyze).toHaveBeenCalledOnce();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
