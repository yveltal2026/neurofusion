// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createMobileRuntime } from "./mobile-runtime";

const detector = vi.hoisted(() => ({
  detect: vi.fn(() => ({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] })),
  close: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: vi.fn(async () => detector) },
}));
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
  expect(detector.detect).toHaveBeenCalledWith(frame);
  expect(result.facialLandmarks).toEqual([]);
  expect(result.gazeState).toBe("closed");
  runtime.stop();
  expect(detector.close).toHaveBeenCalledOnce();
});
