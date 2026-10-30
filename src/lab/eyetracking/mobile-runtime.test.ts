// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMobileRuntime, MOBILE_VISION_WASM, needsMobileRuntime } from "./mobile-runtime";

const control = vi.hoisted(() => ({
  detect: vi.fn(), close: vi.fn(), dispose: vi.fn(), gpuInitialize: vi.fn(), failModel: false,
  options: vi.fn(), fileset: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: control.fileset },
  FaceLandmarker: { createFromOptions: control.options },
}));
vi.mock("webeyetrack", () => ({
  WebEyeTrack: class {
    faceLandmarkerClient = { initialize: control.gpuInitialize, processFrame: control.detect };
    blazeGaze = { model: { dispose: control.dispose } };
    async initialize() {
      await this.faceLandmarkerClient.initialize();
      if (control.failModel) throw new Error("Modelo ausente");
    }
    async step(frame: ImageData) { return this.faceLandmarkerClient.processFrame(frame); }
  },
}));

beforeEach(() => {
  vi.clearAllMocks(); control.failModel = false;
  control.options.mockResolvedValue({ detect: control.detect, close: control.close });
  control.fileset.mockResolvedValue({});
  control.detect.mockResolvedValue({ facialLandmarks: [] });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("detector móvil por CPU", () => {
  it("usa CPU en el hilo principal sin ejecutar el inicializador GPU de la biblioteca", async () => {
    const runtime = await createMobileRuntime();
    expect(control.fileset).toHaveBeenCalledWith(MOBILE_VISION_WASM);
    expect(control.options).toHaveBeenCalledWith({}, expect.objectContaining({
      baseOptions: expect.objectContaining({ delegate: "CPU" }), runningMode: "IMAGE",
    }));
    expect(control.gpuInitialize).not.toHaveBeenCalled();
    const frame = { width: 640, height: 640 } as ImageData;
    await runtime.step(frame, 1);
    expect(control.detect).toHaveBeenCalledWith(frame);
    runtime.stop(); runtime.stop();
    expect(control.close).toHaveBeenCalledOnce();
    expect(control.dispose).toHaveBeenCalledOnce();
  });

  it("espera la inferencia en curso antes de cerrar WASM y liberar el modelo", async () => {
    let finish!: (value: unknown) => void;
    control.detect.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const runtime = await createMobileRuntime();
    const pending = runtime.step({} as ImageData, 1);
    runtime.stop();
    expect(control.close).not.toHaveBeenCalled();
    finish({ facialLandmarks: [] }); await pending; await Promise.resolve();
    expect(control.close).toHaveBeenCalledOnce();
    await expect(runtime.step({} as ImageData, 2)).rejects.toThrow("detenido");
  });

  it("libera el detector si no se puede cargar el modelo de mirada", async () => {
    control.failModel = true;
    await expect(createMobileRuntime()).rejects.toThrow("Modelo ausente");
    expect(control.close).toHaveBeenCalledOnce();
  });

  it("selecciona la ruta móvil en Android y en navegadores táctiles", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Android Chrome/130");
    expect(needsMobileRuntime()).toBe(true);
    vi.mocked(vi.spyOn(navigator, "userAgent", "get")).mockReturnValue("Desktop");
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    expect(needsMobileRuntime()).toBe(true);
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    expect(needsMobileRuntime()).toBe(false);
  });
});
