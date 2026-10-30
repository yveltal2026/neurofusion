// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GazeResult } from "webeyetrack/dist/types";
import { createWebEyeTrackEngine } from "./engine";

const control = vi.hoisted(() => ({
  mobile: false,
  frame: null as null | ((frame: ImageData, timestamp: number) => Promise<void>),
  runtimeStop: vi.fn(),
  runtimeStep: vi.fn(),
  result: null as null | ((result: GazeResult) => void),
  error: null as null | ((error: unknown) => void),
  worker: null as null | (EventTarget & { terminate: ReturnType<typeof vi.fn> }),
  stop: vi.fn(),
}));
vi.mock("./camera", () => ({ createCameraSource: (_video: HTMLVideoElement, onError: (error: unknown) => void) => {
  control.error = onError;
  return { startWebcam: vi.fn(async (callback) => { control.frame = callback; }), stopWebcam: control.stop };
} }));
vi.mock("./mobile-runtime", () => ({
  MOBILE_VISION_WASM: "/test-vision", needsMobileRuntime: () => control.mobile,
  createMobileRuntime: vi.fn(async () => ({ step: control.runtimeStep, stop: control.runtimeStop })),
}));
vi.mock("webeyetrack", () => ({
  WebcamClient: class { startWebcam = vi.fn(); stopWebcam = vi.fn(); },
  WebEyeTrackProxy: class {
    worker = Object.assign(new EventTarget(), { terminate: vi.fn() });
    constructor() { control.worker = this.worker; }
    set onGazeResults(callback: (result: GazeResult) => void) { control.result = callback; }
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  control.mobile = false; control.frame = null; control.runtimeStep.mockReset(); control.runtimeStop.mockClear();
  control.result = null; control.error = null; control.worker = null; control.stop.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("integración del motor", () => {
  it("distingue un rostro con ojos cerrados de una lectura válida", async () => {
    const engine = createWebEyeTrackEngine();
    const frame = vi.fn();
    const starting = engine.start(document.createElement("video"), frame);
    await vi.dynamicImportSettled();
    control.result!({ facialLandmarks: [{ x: 0, y: 0, z: 0 }], gazeState: "closed", normPog: [0, 0], durations: { total: 8 } } as unknown as GazeResult);
    await starting;
    expect(frame).toHaveBeenLastCalledWith(expect.objectContaining({ faceDetected: true, x: null, y: null }));
    control.result!({ facialLandmarks: [{ x: 0, y: 0, z: 0 }], gazeState: "open", normPog: [0, 0], durations: { total: 8 } } as unknown as GazeResult);
    expect(frame).toHaveBeenLastCalledWith(expect.objectContaining({ faceDetected: true, x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    engine.stop();
  });

  it("rechaza permisos denegados y libera el worker inmediatamente", async () => {
    const engine = createWebEyeTrackEngine();
    const starting = engine.start(document.createElement("video"), vi.fn());
    const rejected = expect(starting).rejects.toMatchObject({ kind: "camera-denied" });
    await vi.dynamicImportSettled();
    control.error!(new DOMException("Denied", "NotAllowedError"));
    await rejected;
    expect(control.worker!.terminate).toHaveBeenCalledOnce();
    expect(control.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("libera la cámara y el worker cuando no llegan lecturas", async () => {
    const engine = createWebEyeTrackEngine();
    const starting = engine.start(document.createElement("video"), vi.fn());
    const rejected = expect(starting).rejects.toMatchObject({ kind: "timeout" });
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(45000);
    await rejected;
    expect(control.stop).toHaveBeenCalledOnce();
    expect(control.worker!.terminate).toHaveBeenCalledOnce();
  });

  it("cancela un inicio pendiente sin dejar temporizadores ni aceptar resultados tardíos", async () => {
    const engine = createWebEyeTrackEngine();
    const frame = vi.fn();
    const starting = engine.start(document.createElement("video"), frame);
    const rejected = expect(starting).rejects.toMatchObject({ kind: "camera-error" });
    await vi.dynamicImportSettled();
    engine.stop();
    await rejected;
    control.result!({} as unknown as GazeResult);
    expect(frame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("usa inferencia directa en Android sin crear un worker GPU", async () => {
    control.mobile = true;
    control.runtimeStep.mockResolvedValue({ facialLandmarks: [{ x: 0, y: 0, z: 0 }], gazeState: "open", normPog: [0, 0], durations: { total: 10 } });
    const engine = createWebEyeTrackEngine();
    const frame = vi.fn();
    const starting = engine.start(document.createElement("video"), frame);
    await vi.dynamicImportSettled();
    await control.frame!({ width: 640, height: 640 } as ImageData, 0.04);
    await starting;
    expect(control.worker).toBeNull();
    expect(control.runtimeStep).toHaveBeenCalledOnce();
    expect(frame).toHaveBeenLastCalledWith(expect.objectContaining({ faceDetected: true, x: window.innerWidth / 2 }));
    engine.stop();
    expect(control.runtimeStop).toHaveBeenCalledOnce();
  });

  it("avisa y libera recursos si las lecturas se detienen tras el arranque", async () => {
    const engine = createWebEyeTrackEngine();
    const error = vi.fn();
    const starting = engine.start(document.createElement("video"), vi.fn(), error);
    await vi.dynamicImportSettled();
    control.result!({ facialLandmarks: [], gazeState: "closed", normPog: [0, 0], durations: {} } as unknown as GazeResult);
    await starting;
    await vi.advanceTimersByTimeAsync(9000);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ kind: "timeout", message: expect.stringContaining("dejó de responder") }));
    expect(control.stop).toHaveBeenCalledOnce();
    expect(control.worker!.terminate).toHaveBeenCalledOnce();
  });

});
