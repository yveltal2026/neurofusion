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


describe("AttentionViewer · zonas frías y recorrido", () => {
  it("«Zonas ciegas» explica por qué está vacío cuando no hay ninguna", async () => {
    const user = userEvent.setup();
    const sinFrios: Aoi[] = [{ ...AOIS[0] }, { ...AOIS[1], attention: 0.9 }];
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={sinFrios} />);
    expect(screen.getByRole("button", { name: "Zonas ciegas" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Zonas ciegas" }));
    expect(screen.getByRole("status").textContent).toMatch(/No se detectaron zonas ciegas/);
  });

  it("lista las zonas ciegas y las de baja atención con sus valores, y las cuenta en el botón", async () => {
    const user = userEvent.setup();
    const aois: Aoi[] = [
      ...AOIS,
      { id: "E3", label: "Correo de contacto", kind: "cta", box: [0.6, 0.9, 0.95, 0.96], attention: 0.2, importance: 3, order: null },
      { id: "E4", label: "Decorativo", kind: "image", box: [0.1, 0.5, 0.2, 0.6], attention: 0.1, importance: 1, order: null },
    ];
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={aois} />);
    await user.click(screen.getByRole("button", { name: "Zonas ciegas (2)" }));
    expect(screen.getByText("Zona ciega")).toBeTruthy();
    expect(screen.getByText("Baja atención")).toBeTruthy();
    expect(screen.getByText(/Correo de contacto/)).toBeTruthy();
    expect(screen.getByText(/importancia 3\/5, atención 20 %/)).toBeTruthy();
    expect(screen.queryByText(/Decorativo/)).toBeNull();
  });

  it("«Recorrido» avisa qué elementos importantes quedaron fuera", async () => {
    const user = userEvent.setup();
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={AOIS} />);
    await user.click(screen.getByRole("button", { name: "Recorrido" }));
    expect(screen.getByText(/Fuera del recorrido:/).parentElement?.textContent).toContain("Logo");
  });

  it("no muestra la nota de recorrido si todo está dentro", async () => {
    const user = userEvent.setup();
    render(<AttentionViewer imageUrl="https://x/y.png" width={1080} height={1080} aois={[AOIS[0]]} />);
    await user.click(screen.getByRole("button", { name: "Recorrido" }));
    expect(screen.queryByText(/Fuera del recorrido:/)).toBeNull();
  });
});


describe("AttentionViewer · dibujo sobre el canvas", () => {
  /** Contexto que registra las llamadas (jsdom no dibuja); cualquier otro método es un no-op. */
  function recordingContext(canvas: HTMLCanvasElement) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const ctx = new Proxy(
      { canvas },
      {
        get(target, prop: string) {
          if (prop in target) return (target as Record<string, unknown>)[prop];
          if (prop === "measureText") return () => ({ width: 40 });
          if (prop === "createImageData") return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
          return (...args: unknown[]) => void calls.push({ fn: prop, args });
        },
        set: () => true,
      },
    );
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  const AOIS_DRAW: Aoi[] = [
    { id: "E1", label: "Titular", kind: "headline", box: [0.1, 0.1, 0.9, 0.2], attention: 1, importance: 5, order: 1 },
    { id: "E2", label: "Correo", kind: "cta", box: [0.6, 0.9, 0.95, 0.96], attention: 0.2, importance: 5, order: null },
    { id: "E3", label: "Sello", kind: "badge", box: [0.1, 0.8, 0.3, 0.88], attention: 0.3, importance: 3, order: null },
  ];

  function renderWithRecorder(mode: "heatmap" | "blind") {
    const rec: { calls: { fn: string; args: unknown[] }[] }[] = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      const r = recordingContext(this);
      rec.push(r);
      return r.ctx;
    } as unknown as HTMLCanvasElement["getContext"];
    render(<AttentionViewer imageUrl="https://x/y.png" width={800} height={800} aois={AOIS_DRAW} initialMode={mode} />);
    return rec.flatMap((r) => r.calls);
  }

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  });

  it("zonas ciegas: tacha la ciega y rotula las dos con su nivel", () => {
    const calls = renderWithRecorder("blind");
    const labels = calls.filter((c) => c.fn === "fillText").map((c) => String(c.args[0]));
    expect(labels).toContain("Zona ciega · Correo");
    expect(labels).toContain("Baja atención · Sello");
    expect(labels).not.toContain("Zona ciega · Titular");
    // ciega: relleno oscuro + marco; baja atención: marco discontinuo sin relleno
    expect(calls.filter((c) => c.fn === "fillRect").length).toBeGreaterThanOrEqual(2); // fondo del rótulo + sombra de la ciega
    expect(calls.some((c) => c.fn === "setLineDash" && (c.args[0] as number[]).length === 2 && (c.args[0] as number[])[0] > 0)).toBe(true);
  });

  it("mapa de atención: marca como «frío» los elementos que casi no tienen calor", () => {
    const calls = renderWithRecorder("heatmap");
    const labels = calls.filter((c) => c.fn === "fillText").map((c) => String(c.args[0]));
    expect(labels).toContain("Frío · Correo");
    expect(labels).toContain("Frío · Sello");
    expect(labels).not.toContain("Frío · Titular");
    expect(calls.some((c) => c.fn === "drawImage")).toBe(true); // el calor sigue dibujándose
  });
});
