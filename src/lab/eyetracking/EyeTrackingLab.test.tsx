// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EyeTrackingLab } from "./EyeTrackingLab";
import { completionAllowed, eyeRunSchema, requiredDriftChecksPass } from "@/tools/visual/eye/schema";

const control = vi.hoisted(() => ({ failDrift: false, noisy: false, saturateLower: false, startError: false, validationBiasPx: 0, loseDuringSettle: false, dropFirstDriftMeasurement: false }));
vi.mock("./engine", async (original) => {
  const actual = await original<typeof import("./engine")>();
  return { ...actual, requestCamera: vi.fn(), checkModelAssets: vi.fn(), checkCdnReachable: vi.fn(),
    createWebEyeTrackEngine: () => {
      let timer: ReturnType<typeof setInterval>;
      let count = 0;
      let driftKey: string | null = null;
      let driftSince = 0;
      let firstDriftAt: number | null = null;
      return { id: "webeyetrack@0.0.2", calibration: "global-click",
        start: async (_video: unknown, onFrame: (f: { t: number; x: number | null; y: number | null; inferenceMs: number }) => void) => {
          timer = setInterval(() => {
            const dot = document.querySelector<HTMLElement>('button[aria-label^="Punto de calibración"], [data-testid="validation-target"], [data-testid="drift-target"]');
            let x = dot ? Number.parseFloat(dot.style.left) : window.innerWidth / 2;
            let y = dot ? Number.parseFloat(dot.style.top) : window.innerHeight / 2;
            if (control.noisy && dot?.getAttribute("aria-label") === "Punto de calibración 1") {
              const noise = ((count++ % 3) - 1) * 0.03;
              x += noise * window.innerWidth;
              y += noise * window.innerHeight;
            }
            if (control.saturateLower && y > window.innerHeight * 0.85) y = window.innerHeight;
            if (control.failDrift && dot?.dataset.testid === "drift-target") { x = 0; y = 0; }
            if (dot?.dataset.testid === "validation-target") x += control.validationBiasPx;
            const key = dot?.dataset.testid === "drift-target" ? `${dot.style.left}:${dot.style.top}` : null;
            if (key !== driftKey) { driftKey = key; driftSince = performance.now(); }
            if (key && firstDriftAt === null) firstDriftAt = performance.now();
            const lost = key && ((control.loseDuringSettle && performance.now() - driftSince < 950)
              || (control.dropFirstDriftMeasurement && firstDriftAt !== null && performance.now() - firstDriftAt >= 975 && performance.now() - firstDriftAt < 1975));
            onFrame({ t: performance.now(), x: lost ? null : x, y: lost ? null : y, inferenceMs: 10 });
          }, 25);
          return { readyMs: 1 };
        }, stop: () => clearInterval(timer) };
    } };
});

const assets = [1, 2, 3].map((n) => ({ id: `40000000-0000-4000-8000-00000000000${n}`, title: `Pieza ${n}`, url: `/piece-${n}.png` }));
const study = { token: "t".repeat(43), title: "Estudio de prueba", assets, durationSeconds: 5, preview: false };
let activeAssets = assets;
let starts: number;
let completed: ReturnType<typeof eyeRunSchema.parse> | null;

async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function click(name: string) { act(() => { fireEvent.click(screen.getByRole("button", { name })); }); }

async function calibrate() {
  const expectsReview = control.noisy;
  click("Comenzar calibración");
  for (let i = 1; i <= 9; i++) {
    await tick(1200);
    click(`Punto de calibración ${i}`);
    await tick(1100);
    if (control.saturateLower && [2, 6, 8].includes(i)) {
      await tick(1200);
      click(`Punto de calibración ${i}`);
      await tick(1100);
    }
    if (i === 1) control.noisy = false;
  }
  expect(Boolean(screen.queryByText(/Revisión selectiva/))).toBe(expectsReview);
  if (expectsReview) {
    await tick(1200);
    click("Punto de calibración 1");
    await tick(1100);
  }
  await tick(3000);
  for (let i = 0; i < 8; i++) await tick(2500);
  expect(screen.getByRole("heading", { name: "Calibración terminada" })).toBeTruthy();
}

async function setup(currentStudy = study) {
  activeAssets = currentStudy.assets;
  render(<EyeTrackingLab study={currentStudy} />);
  fireEvent.change(screen.getByLabelText("Tamaño de pantalla (pulgadas)"), { target: { value: "27" } });
  fireEvent.change(screen.getByLabelText("Calibración"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Acepto usar la cámara/ }));
  click("Iniciar cámara y cargar modelos");
  await tick(0);
  await tick(500);
  await calibrate();
}
async function drift() { for (let i = 0; i < 3; i++) await tick(2000); await tick(20); }
async function piece() { await tick(20); await tick(5000); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  control.failDrift = false; control.noisy = false; control.saturateLower = false;
  control.startError = false;
  control.validationBiasPx = 0; control.loseDuringSettle = false; control.dropFirstDriftMeasurement = false;
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  starts = 0; completed = null; activeAssets = assets;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(window.screen, "width", { value: 1280, configurable: true });
  Object.defineProperty(window.screen, "height", { value: 800, configurable: true });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} });
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    set src(_url: string) { Promise.resolve().then(() => this.onload?.()); }
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/start")) {
      starts++;
      expect(JSON.parse(String(init.body)).protocol).toBe("eye-v3");
      return control.startError ? Response.json({ message: "No se pudo iniciar la sesión" }, { status: 503 })
        : Response.json({ sessionId: "30000000-0000-4000-8000-000000000001" });
    }
    if (url.endsWith("/complete")) {
      const run = eyeRunSchema.parse(JSON.parse(String(init.body)));
      expect(completionAllowed(run.quality, "desktop", activeAssets.length, "eye-v3")).toBe(true);
      if (run.quality.measurementStatus !== "limited") expect(requiredDriftChecksPass(run.quality, "desktop", activeAssets.length, true)).toBe(true);
      completed = run;
      return Response.json({ ok: true });
    }
    throw new Error("Unexpected URL");
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("estudios con control de calidad", () => {
  it("no rechaza el control por perder lecturas mientras los ojos cambian de objetivo", async () => {
    control.loseDuringSettle = true;
    await setup();
    click("Comenzar presentación"); await drift();
    expect(starts).toBe(1);
    expect(screen.getByAltText("Pieza 1")).toBeTruthy();
    expect(screen.queryByText(/Hagamos un ajuste rápido/)).toBeNull();
  });

  it("recaptura una sola vez un punto sin lecturas suficientes antes de rechazar el control", async () => {
    control.dropFirstDriftMeasurement = true;
    await setup();
    click("Comenzar presentación");
    await tick(2000); expect(starts).toBe(0);
    await tick(1500); await tick(2000); await tick(2000); await tick(20);
    expect(starts).toBe(1);
    expect(screen.getByAltText("Pieza 1")).toBeTruthy();
  });

  it("permite terminar con precisión limitada tras fallos persistentes sin guardarlos como mirada válida", async () => {
    await setup();
    click("Comenzar presentación"); await drift();
    await piece(); await piece();
    control.failDrift = true; await drift();
    expect(screen.queryByRole("button", { name: "Continuar con precisión limitada" })).toBeNull();
    expect(screen.getByText(/La desviación de la mirada supera/)).toBeTruthy();
    click("Revisar mirada y continuar"); await drift();
    click("Continuar con precisión limitada"); await tick(20);
    expect(screen.getByAltText("Pieza 1")).toBeTruthy();
    await piece(); await piece(); await drift(); await piece(); await drift();
    expect(screen.getByRole("heading", { name: "Gracias por participar" })).toBeTruthy();
    expect(completed!.quality.measurementStatus).toBe("limited");
    expect(completed!.quality.passed).toBe(false);
    expect(requiredDriftChecksPass(completed!.quality, "desktop", 3, true)).toBe(false);
    expect(completed!.observations.map((o) => o.assetId)).toEqual(assets.map((a) => a.id));
    expect(starts).toBe(1);
  });

  it("revisa sólo el punto débil y exige controles antes, entre bloques y al finalizar", async () => {
    control.noisy = true;
    await setup();
    click("Comenzar presentación");
    expect(starts).toBe(0);
    await drift();
    expect(starts).toBe(1);
    await piece(); await piece();
    expect(completed).toBeNull();
    await drift();
    expect(screen.getByAltText("Pieza 3")).toBeTruthy();
    await piece(); await drift();
    expect(screen.getByRole("heading", { name: "Gracias por participar" })).toBeTruthy();
    expect(completed!.observations.map((o) => o.assetId)).toEqual(assets.map((a) => a.id));
    expect(completed!.quality.driftChecks?.map((c) => c.afterAssetCount)).toEqual([0, 2, 3]);
  });

  it("pausa ante deriva y permite recolocarse con 3 puntos sin recalibrar ni abrir otra sesión", async () => {
    await setup();
    click("Comenzar presentación"); await drift();
    await piece(); await piece();
    control.failDrift = true; await drift();
    expect(screen.getByRole("heading", { name: "Hagamos un ajuste rápido" })).toBeTruthy();
    expect(completed).toBeNull();
    control.failDrift = false;
    click("Revisar mirada y continuar"); await drift();
    expect(screen.getByAltText("Pieza 1")).toBeTruthy();
    expect(starts).toBe(1);
    await piece(); await piece(); await drift(); await piece(); await drift();
    expect(completed!.observations).toHaveLength(3);
    expect(completed!.quality.recovery).toMatchObject({ interruptions: 1, recalibrations: 0, repeatedAssetIds: assets.slice(0, 2).map((a) => a.id) });
    expect(completed!.quality.recovery!.checks.map((c) => c.passed)).toEqual([false, true]);
  });

  it("si falla al terminar la cuarta imagen, conserva las dos primeras incluso tras recalibrar", async () => {
    const four = [...assets, { id: "40000000-0000-4000-8000-000000000004", title: "Pieza 4", url: "/piece-4.png" }];
    control.validationBiasPx = 30;
    await setup({ ...study, assets: four });
    control.validationBiasPx = 0;
    click("Comenzar presentación"); await drift();
    await piece(); await piece(); await drift();
    await piece(); await piece();
    control.failDrift = true; await drift();
    expect(screen.getByText(/Conservamos 2 de 4 imágenes validadas/)).toBeTruthy();
    click("Revisar mirada y continuar"); await drift();
    expect(screen.getByRole("heading", { name: "Hagamos un ajuste rápido" })).toBeTruthy();
    expect(completed).toBeNull();
    control.failDrift = false;
    await calibrateFromResults();
    click("Continuar desde imagen 3"); await drift();
    expect(screen.getByAltText("Pieza 3")).toBeTruthy();
    expect(screen.queryByAltText("Pieza 1")).toBeNull();
    expect(starts).toBe(1);
    await piece(); await piece(); await drift();
    expect(completed!.observations.map((o) => o.assetId)).toEqual(four.map((a) => a.id));
    expect(completed!.quality.driftChecks!.map((c) => c.afterAssetCount)).toEqual([0, 2, 4]);
    expect(completed!.quality.recovery).toMatchObject({ recalibrations: 1, repeatedAssetIds: four.slice(2).map((a) => a.id) });
    // La nueva calibración más precisa no oculta el error de la que midió las imágenes conservadas.
    expect(completed!.quality.medianErrorDeg).toBeGreaterThan(0.5);
  });

  it("conserva el bloque validado si se oculta la pestaña durante la siguiente imagen", async () => {
    await setup();
    click("Comenzar presentación"); await drift();
    await piece(); await piece(); await drift(); await tick(20);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await tick(8000);
    expect(screen.getByText(/Conservamos 2 de 3 imágenes validadas/)).toBeTruthy();
    expect(completed).toBeNull();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    click("Revisar mirada y continuar"); await drift();
    expect(screen.getByAltText("Pieza 3")).toBeTruthy();
    await piece(); await drift();
    expect(completed!.observations).toHaveLength(3);
    expect(completed!.quality.recovery!.repeatedAssetIds).toEqual([assets[2].id]);
    expect(starts).toBe(1);
  });

  it("desplaza puntos saturados y vuelve a capturar únicamente esos puntos", async () => {
    control.saturateLower = true;
    await setup();
    expect((screen.getByRole("button", { name: "Comenzar presentación" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignora un resize sin cambio real y exige recalibrar si cambia la geometría, conservando el bloque validado", async () => {
    await setup();
    click("Comenzar presentación"); await drift();
    await piece(); await piece(); await drift(); await tick(20);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(screen.getByAltText("Pieza 3")).toBeTruthy();
    const descriptor = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
    try {
      Object.defineProperty(window, "innerWidth", { value: window.innerWidth + 100, configurable: true });
      act(() => { window.dispatchEvent(new Event("resize")); });
      expect(screen.getByText(/Conservamos 2 de 3 imágenes validadas/)).toBeTruthy();
      expect((screen.getByRole("button", { name: "Revisar mirada y continuar" }) as HTMLButtonElement).disabled).toBe(true);
      await tick(10_000);
      expect(completed).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", descriptor);
    }
  });

  it("cancela una comprobación al ocultar la pestaña sin iniciar ni guardar la sesión", async () => {
    await setup();
    click("Comenzar presentación");
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await tick(10_000);
    expect(screen.getByRole("heading", { name: "Acomódate frente a la cámara" })).toBeTruthy();
    expect(starts).toBe(0);
    expect(completed).toBeNull();
  });

  it("vuelve a resultados si falla el inicio y permite volver a intentar", async () => {
    await setup();
    control.startError = true;
    click("Comenzar presentación"); await drift();
    expect(screen.getByText("No se pudo iniciar la sesión")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Comenzar presentación" }) as HTMLButtonElement).disabled).toBe(false);
    control.startError = false;
    click("Comenzar presentación"); await drift();
    expect(starts).toBe(2);
    expect(screen.getByAltText("Pieza 1")).toBeTruthy();
  });
});

async function calibrateFromResults() {
  // El botón de resultados inicia el mismo recorrido que el de posición.
  click("Recalibrar");
  for (let i = 1; i <= 9; i++) { await tick(1200); click(`Punto de calibración ${i}`); await tick(1100); }
  await tick(3000);
  for (let i = 0; i < 8; i++) await tick(2500);
}
