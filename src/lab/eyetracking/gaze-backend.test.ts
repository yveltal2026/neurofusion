// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { selectGazeBackend } from "./gaze-backend";

const control = vi.hoisted(() => ({ backend: "webgl", clock: 0, wasmMs: 4, mismatch: false, fail: false,
  setBackend: vi.fn(), setWasmPaths: vi.fn(), setThreadsCount: vi.fn() }));
vi.mock("@tensorflow/tfjs-core", () => ({
  ready: vi.fn(async () => {}), getBackend: () => control.backend,
  setBackend: control.setBackend,
  tidy: (fn: () => unknown) => fn(),
  browser: { fromPixels: () => { const image = { toFloat: () => image, expandDims: () => image, div: () => image }; return image; } },
  tensor2d: vi.fn(),
}));
vi.mock("@tensorflow/tfjs-backend-wasm", () => ({ setWasmPaths: control.setWasmPaths, setThreadsCount: control.setThreadsCount }));
const predict = vi.fn(() => ({ dataSync: () => {
  control.clock += control.backend === "wasm" ? control.wasmMs : 10;
  return [control.backend === "wasm" && control.mismatch ? 0.2 : 0.1, 0.3];
} }));

beforeEach(() => {
  vi.clearAllMocks(); control.backend = "webgl"; control.clock = 0; control.wasmMs = 4; control.mismatch = false; control.fail = false;
  control.setBackend.mockImplementation(async (backend: string) => { if (backend === "wasm" && control.fail) throw new Error("Download failed"); control.backend = backend; return true; });
  vi.spyOn(performance, "now").mockImplementation(() => control.clock);
  vi.stubGlobal("ImageData", class { data: Uint8ClampedArray; constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("elige WASM sólo con inferencia y lectura equivalentes al menos 15 % más rápidas", async () => {
  const report = await selectGazeBackend(predict as never);
  expect(report).toMatchObject({ baseline: "webgl", selected: "wasm", baselineMedianMs: 10, wasmMedianMs: 4, status: "selected-wasm" });
  expect(predict).toHaveBeenCalledTimes(14);
  expect(control.setThreadsCount).toHaveBeenCalledWith(1);
});

it.each([9, 15])("conserva la ruta anterior si WASM tarda %s ms", async (ms) => {
  control.wasmMs = ms;
  expect(await selectGazeBackend(predict as never)).toMatchObject({ selected: "webgl", status: "retained" });
  expect(control.backend).toBe("webgl");
});

it("rechaza un candidato rápido que cambia las coordenadas", async () => {
  control.mismatch = true;
  expect(await selectGazeBackend(predict as never)).toMatchObject({ selected: "webgl", status: "retained" });
  expect(control.backend).toBe("webgl");
});

it("una descarga opcional fallida restaura el backend sin impedir iniciar la cámara", async () => {
  control.fail = true;
  expect(await selectGazeBackend(predict as never)).toMatchObject({ selected: "webgl", status: "unavailable" });
  expect(control.backend).toBe("webgl");
});

it("cancela sin dejar un backend cambiado y permite otro inicio", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(selectGazeBackend(predict as never, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(control.backend).toBe("webgl");
  expect(await selectGazeBackend(predict as never)).toMatchObject({ selected: "wasm" });
});

it("restaura el backend si se cancela justo al terminar la prueba del candidato", async () => {
  const controller = new AbortController();
  let reads = 0;
  const cancel = () => ({ dataSync: () => { const output = predict().dataSync(); if (++reads === 14) controller.abort(); return output; } });
  await expect(selectGazeBackend(cancel as never, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(control.backend).toBe("webgl");
});

it("serializa también la carga de pesos de un reinicio con la selección anterior", async () => {
  let finish!: () => void;
  const loading = new Promise<void>((resolve) => { finish = resolve; });
  const secondInitialize = vi.fn(async () => {});
  const first = selectGazeBackend(predict as never, undefined, undefined, () => loading);
  const second = selectGazeBackend(predict as never, undefined, undefined, secondInitialize);
  await Promise.resolve(); await Promise.resolve();
  expect(secondInitialize).not.toHaveBeenCalled();
  finish(); await first; await second;
  expect(secondInitialize).toHaveBeenCalledOnce();
});
