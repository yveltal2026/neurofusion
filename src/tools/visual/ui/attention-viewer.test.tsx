// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Aoi } from "../engine/aoi";

const saveAois = vi.fn<(input: unknown) => Promise<{ error?: string; ok?: boolean }>>(async () => ({ ok: true }));
vi.mock("../actions", () => ({ saveAois: (input: unknown) => saveAois(input) }));

import { AttentionViewer } from "./attention-viewer";

// jsdom no implementa canvas: basta con un contexto nulo (el dibujo se prueba en el motor).
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);

const AOIS: Aoi[] = [
  { id: "E1", label: "Titular", kind: "headline", box: [0.1, 0.1, 0.9, 0.2], attention: 1, importance: 5, order: 1 },
  { id: "E2", label: "Logo", kind: "logo", box: [0.7, 0.9, 0.9, 0.95], attention: 0.2, importance: 4, order: null },
];

describe("AttentionViewer", () => {
  it("muestra las capas y cuenta las zonas ciegas", () => {
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={AOIS} />);
    expect(screen.getByRole("button", { name: "Mapa de atención" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Zonas ciegas (1)" })).toBeTruthy();
    expect(screen.getByText(/No es eye tracking/)).toBeTruthy();
  });

  it("el analista edita un área y la guarda como revisada", async () => {
    const user = userEvent.setup();
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={AOIS} studyId="s" assetId="a" editable />);
    await user.click(screen.getByRole("button", { name: "Áreas de interés" }));
    expect((screen.getByRole("button", { name: "Sin cambios" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "E2 · Logo" }));
    const label = screen.getByRole("textbox", { name: "Etiqueta" });
    await user.clear(label);
    await user.type(label, "Logotipo");
    await user.click(screen.getByRole("button", { name: "Guardar áreas revisadas" }));
    expect(saveAois).toHaveBeenCalledTimes(1);
    const arg = saveAois.mock.calls[0][0] as { aois: Aoi[] };
    expect(arg.aois.find((a) => a.id === "E2")?.label).toBe("Logotipo");
    expect(await screen.findByText(/revisadas por el analista/)).toBeTruthy();
  });

  it("elimina un área", async () => {
    const user = userEvent.setup();
    saveAois.mockClear();
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={AOIS} studyId="s" assetId="a" editable initialMode="boxes" />);
    await user.click(screen.getByRole("button", { name: "E1 · Titular" }));
    await user.click(screen.getByRole("button", { name: "Eliminar área" }));
    await user.click(screen.getByRole("button", { name: "Guardar áreas revisadas" }));
    expect((saveAois.mock.calls[0][0] as { aois: Aoi[] }).aois.map((a) => a.id)).toEqual(["E2"]);
  });
});

describe("AttentionViewer · teclado", () => {
  it("agrega un área sin mouse y ajusta su posición con campos numéricos", async () => {
    const user = userEvent.setup();
    saveAois.mockClear();
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={AOIS} studyId="s" assetId="a" editable initialMode="boxes" />);
    await user.click(screen.getByRole("button", { name: "+ Agregar área" }));
    const left = screen.getByRole("spinbutton", { name: "Izquierda" });
    await user.clear(left);
    await user.type(left, "10");
    await user.click(screen.getByRole("button", { name: "Guardar áreas revisadas" }));
    const saved = (saveAois.mock.calls[0][0] as { aois: Aoi[] }).aois;
    expect(saved).toHaveLength(3);
    expect(saved[2].box[0]).toBeCloseTo(0.1, 5);
  });
});
