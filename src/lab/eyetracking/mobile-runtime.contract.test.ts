// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createMobileRuntime } from "./mobile-runtime";

const detector = vi.hoisted(() => ({
  detect: vi.fn(() => ({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] } as FaceLandmarkerResult)),
  close: vi.fn(),
}));
vi.mock("./gaze-backend", () => ({ selectGazeBackend: vi.fn(async (_predict, _signal, _root, initialize) => { await initialize?.(); return { selected: "webgl" }; }) }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: vi.fn(async () => ({ ...detector, detectForVideo: detector.detect })) },
}));
beforeEach(() => { vi.clearAllMocks(); detector.detect.mockReturnValue({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("el adaptador es compatible con WebEyeTrack 0.0.2 real, sin instanciar su worker ni detector GPU", async () => {
  // Sólo se sustituyen las descargas de modelos. WebEyeTrack, su step() y los
  // accesos internos son los del paquete instalado, no una copia simulada.
  const { BlazeGaze, FaceLandmarkerClient } = await import("webeyetrack");
  vi.spyOn(BlazeGaze.prototype, "loadModel").mockResolvedValue();
  const gpu = vi.spyOn(FaceLandmarkerClient.prototype, "initialize");
  vi.stubGlobal("ImageData", class {
    data: Uint8ClampedArray;
    constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
  });
  const runtime = await createMobileRuntime();
  const frame = new ImageData(64, 64);
  const result = await runtime.step(frame, 0.04);
  expect(gpu).not.toHaveBeenCalled();
  expect(detector.detect).toHaveBeenCalledWith(frame, 40);
  expect(result.facialLandmarks).toEqual([]);
  expect(result.gazeState).toBe("closed");
  runtime.stop();
  expect(detector.close).toHaveBeenCalledOnce();
});


it("un recorte negativo con WebEyeTrack real invalida sólo el frame y permite el siguiente", async () => {
  const { BlazeGaze, WebEyeTrack } = await import("webeyetrack");
  vi.spyOn(BlazeGaze.prototype, "loadModel").mockResolvedValue();
  const allocations = vi.fn();
  vi.stubGlobal("ImageData", class {
    data: Uint8ClampedArray;
    constructor(readonly width: number, readonly height: number) {
      allocations(width, height);
      if (width <= 0 || height <= 0 || width > 1024 || height > 1024) throw new RangeError("Failed to construct ImageData: requested image size exceeds supported range");
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  });
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  for (const [i, x, y] of [[103, 0.3, 0.2], [150, 0.3, 0.8], [379, 0.7, 0.8], [332, 0.7, 0.2], [151, 0.5, 0.4], [195, 0.5, 0.1]]) face[i] = { x, y, z: 0, visibility: 1 };
  const badResult = { faceLandmarks: [face], faceBlendshapes: [], facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] };
  const frame = new ImageData(64, 64);
  // Demuestra el fallo en el código original antes de comprobar la protección.
  expect(() => new WebEyeTrack().prepareInput(frame, badResult)).toThrow(/requested image size/);
  allocations.mockClear();
  detector.detect.mockReturnValueOnce(badResult);
  const runtime = await createMobileRuntime();
  const invalid = await runtime.step(frame, 0.04);
  expect(invalid.facialLandmarks).toHaveLength(478);
  expect(invalid.gazeState).toBe("closed");
  const next = await runtime.step(frame, 0.08);
  expect(next.facialLandmarks).toEqual([]);
  expect(allocations.mock.calls.every(([width, height]) => width > 0 && height > 0 && width <= 1024 && height <= 1024)).toBe(true);
  runtime.stop();
});
