// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Aoi } from "@/tools/visual/engine/aoi";
import type { EyeObservation } from "@/tools/visual/eye/schema";
import { EyeResults } from "./eye-results";

const aois: Aoi[] = [
  {
    id: "L",
    label: "Logo",
    kind: "logo",
    box: [0, 0, 0.4, 1],
    attention: 0,
    importance: 3,
    order: null,
  },
];
const makeObservation = (x: number): EyeObservation => ({
  assetId: "asset",
  durationMs: 5000,
  framesTotal: 5,
  framesValid: 5,
  samples: Array.from({ length: 5 }, (_, i) => ({
    t: 100 + i * 50,
    x,
    y: 0.5,
  })),
});
const props = {
  studyId: "study",
  assetId: "asset",
  title: "Prueba",
  imageUrl: "/test.png",
  width: 1000,
  height: 500,
  aois,
  participants: [
    { sessionId: "1", participant: "P1", observation: makeObservation(0.2) },
    { sessionId: "2", participant: "P2", observation: makeObservation(0.8) },
  ],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("muestra los KPIs agregados, cambia de participante y alterna visualizaciones", () => {
  render(<EyeResults {...props} />);
  let row = within(
    screen.getByRole("rowheader", { name: "Logo" }).closest("tr")!,
  );
  expect(row.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "100",
    "0.5",
    "200",
    "100",
    "100",
    "50",
    "50",
    "0.5",
    "0",
  ]);
  fireEvent.change(screen.getByLabelText("Participante"), {
    target: { value: "2" },
  });
  row = within(screen.getByRole("rowheader", { name: "Logo" }).closest("tr")!);
  expect(row.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "sin dato",
    "0",
    "sin dato",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
  expect(screen.getByText("Medido")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recorrido" }));
  expect(
    screen
      .getByRole("img", { name: "Secuencia de fijaciones por participante" })
      .querySelectorAll("circle"),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Áreas de interés" }));
  expect(
    screen
      .getByRole("img", { name: "Áreas de interés delimitadas" })
      .querySelectorAll("rect"),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Calor" }));
  fireEvent.change(screen.getByLabelText("Métrica del mapa"), {
    target: { value: "count" },
  });
  expect(
    screen.getByRole("img", { name: "Mapa de calor por número de fijaciones" }),
  ).toBeTruthy();
});

it("distingue ausencia de registros de ceros medidos y ofrece definir AOI", () => {
  const { rerender } = render(<EyeResults {...props} participants={[]} />);
  expect(
    within(screen.getByRole("rowheader", { name: "Logo" }).closest("tr")!)
      .getAllByRole("cell")
      .every((cell) => cell.textContent === "sin dato"),
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Descargar KPIs agregados CSV",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  rerender(<EyeResults {...props} aois={[]} />);
  expect(screen.getByText(/Define las áreas de interés/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Definir áreas de interés (0)" })
      .getAttribute("href"),
  ).toBe("/studies/study/assets/asset");
});

it("exporta todas las sesiones de la base agregada aunque se haya seleccionado una persona", async () => {
  let exported: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      exported = blob;
      return "blob:test";
    },
    revokeObjectURL: vi.fn(),
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  render(<EyeResults {...props} />);
  fireEvent.change(screen.getByLabelText("Participante"), {
    target: { value: "2" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Descargar KPIs por participante CSV" }),
  );
  expect(exported?.size).toBeGreaterThan(100);
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(exported!);
  });
  expect(content).toContain(
    "asset,1,P1,idt-image-v1,Logo,100,1,200,200,200,100,100,1,0",
  );
  expect(content).toContain("asset,2,P2,idt-image-v1,Logo,,0,,0,0,0,0,0,0");
  expect(click).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("abre el visor a pantalla completa, permite hacer zoom in / out y lo cierra con el botón o con Escape", () => {
  render(<EyeResults {...props} />);
  expect(screen.queryByRole("dialog", { name: "Visor de miradas a pantalla completa" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Pantalla completa" }));
  expect(screen.getByRole("dialog", { name: "Visor de miradas a pantalla completa" })).toBeTruthy();

  // Comprobar zoom inicial 100%
  expect(screen.getByRole("button", { name: "Nivel de zoom: 100%" })).toBeTruthy();

  // Zoom in con botón
  fireEvent.click(screen.getByRole("button", { name: "Acercar zoom" }));
  expect(screen.getByRole("button", { name: "Nivel de zoom: 125%" })).toBeTruthy();

  // Zoom in adicional
  fireEvent.click(screen.getByRole("button", { name: "Acercar zoom" }));
  expect(screen.getByRole("button", { name: "Nivel de zoom: 150%" })).toBeTruthy();

  // Zoom out con botón
  fireEvent.click(screen.getByRole("button", { name: "Alejar zoom" }));
  expect(screen.getByRole("button", { name: "Nivel de zoom: 125%" })).toBeTruthy();

  // Restablecer zoom al 100%
  fireEvent.click(screen.getByRole("button", { name: "Nivel de zoom: 125%" }));
  expect(screen.getByRole("button", { name: "Nivel de zoom: 100%" })).toBeTruthy();

  // Zoom con teclado (+ y 0)
  fireEvent.keyDown(window, { key: "+" });
  expect(screen.getByRole("button", { name: "Nivel de zoom: 125%" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "0" });
  expect(screen.getByRole("button", { name: "Nivel de zoom: 100%" })).toBeTruthy();

  // Cierra con Escape
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Visor de miradas a pantalla completa" })).toBeNull();

  // Abre de nuevo y cierra con el botón Cerrar
  fireEvent.click(screen.getByRole("button", { name: "Pantalla completa" }));
  expect(screen.getByRole("dialog", { name: "Visor de miradas a pantalla completa" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar ✕" }));
  expect(screen.queryByRole("dialog", { name: "Visor de miradas a pantalla completa" })).toBeNull();
});
