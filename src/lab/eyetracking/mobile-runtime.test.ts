// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMobileRuntime, MOBILE_VISION_WASM, needsMobileRuntime } from "./mobile-runtime";

const control = vi.hoisted(() => ({
  detect: vi.fn(), close: vi.fn(), dispose: vi.fn(), gpuInitialize: vi.fn(), failModel: false,
  options: vi.fn(), fileset: vi.fn(), pendingStep: null as Promise<unknown> | null,
}));
vi.mock("./gaze-backend", () => ({ selectGazeBackend: vi.fn(async () => ({ selected: "webgl" })) }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: control.fileset },
  FaceLandmarker: { createFromOptions: control.options },
}));
vi.mock("webeyetrack", () => ({
  WebEyeTrack: class {
    faceLandmarkerClient = { initialize: control.gpuInitialize, processFrame: control.detect };
    blazeGaze = { model: { dispose: control.dispose }, predict: vi.fn() };
    prepareInput = vi.fn();
    async initialize() {
      await this.faceLandmarkerClient.initialize();
      if (control.failModel) throw new Error("Modelo ausente");
    }
    async step(frame: ImageData) { return control.pendingStep ? await control.pendingStep : this.faceLandmarkerClient.processFrame(frame); }
  },
}));

beforeEach(() => {
  vi.clearAllMocks(); control.failModel = false; control.pendingStep = null;
  control.options.mockResolvedValue({ detect: control.detect, detectForVideo: control.detect, close: control.close });
  control.fileset.mockResolvedValue({});
  control.detect.mockReturnValue({ faceLandmarks: [] });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("detector móvil acelerado", () => {
  it("prefiere GPU en el hilo principal sin ejecutar el inicializador del worker", async () => {
    const runtime = await createMobileRuntime();
    expect(control.fileset).toHaveBeenCalledWith(MOBILE_VISION_WASM);
    expect(control.options).toHaveBeenCalledWith({}, expect.objectContaining({
      baseOptions: expect.objectContaining({ delegate: "GPU" }), runningMode: "VIDEO",
      canvas: expect.any(HTMLCanvasElement), outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
    }));
    expect(control.gpuInitialize).not.toHaveBeenCalled();
    const frame = { width: 640, height: 640 } as ImageData;
    await runtime.step(frame, 1);
    expect(control.detect).toHaveBeenCalledWith(frame, 1000);
    runtime.stop(); runtime.stop();
    expect(control.close).toHaveBeenCalledOnce();
    expect(control.dispose).toHaveBeenCalledOnce();
  });

  it("espera la inferencia en curso antes de cerrar WASM y liberar el modelo", async () => {
    let finish!: (value: unknown) => void;
    control.pendingStep = new Promise((resolve) => { finish = resolve; });
    const runtime = await createMobileRuntime();
    const pending = runtime.step({} as ImageData, 1);
    runtime.stop();
    expect(control.close).not.toHaveBeenCalled();
    finish({ faceLandmarks: [] }); await pending; await Promise.resolve();
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
  it("recurre a CPU si la GPU del navegador no permite inicializar el detector", async () => {
    control.options.mockRejectedValueOnce(new Error("WebGL unavailable"));
    const runtime = await createMobileRuntime();
    expect(runtime.backend).toBe("main-cpu");
    expect(runtime.gpuError).toEqual({ name: "Error", message: "WebGL unavailable" });
    expect(control.options.mock.calls[1][1]).not.toHaveProperty("canvas");
    expect(control.options).toHaveBeenLastCalledWith({}, expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: "CPU" }) }));
    runtime.stop();
  });

  it("cambia a CPU si el contexto GPU falla durante la detección, sin cambiar los controles de calidad", async () => {
    control.detect.mockImplementationOnce(() => { throw new Error("GPU context lost"); });
    const runtime = await createMobileRuntime();
    await runtime.step({} as ImageData, 1);
    expect(runtime.backend).toBe("main-cpu");
    expect(runtime.gpuError).toEqual({ name: "Error", message: "GPU context lost" });
    expect(control.options).toHaveBeenCalledTimes(2);
    expect(control.detect).toHaveBeenCalledTimes(2);
    runtime.stop();
    expect(control.close).toHaveBeenCalledTimes(2);
  });

  it("cambia a CPU si la GPU devuelve vacío y la CPU reconoce el mismo frame", async () => {
    const empty = { faceLandmarks: [] };
    const face = { faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]] };
    const gpu = { detectForVideo: vi.fn(() => empty), close: vi.fn() };
    const cpu = { detectForVideo: vi.fn(() => face), close: vi.fn() };
    control.options.mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu);
    const runtime = await createMobileRuntime();
    const frame = {} as ImageData;
    for (let i = 1; i <= 5; i++) await runtime.step(frame, i / 30);
    expect(runtime.backend).toBe("main-cpu");
    expect(runtime.fallbackReason).toBe("gpu-empty-cpu-detected-face");
    expect(cpu.detectForVideo).toHaveBeenCalledWith(frame, 5 / 30 * 1000);
    expect(gpu.close).toHaveBeenCalledOnce();
    runtime.stop(); expect(cpu.close).toHaveBeenCalledOnce();
  });

  it("no atribuye una cámara sin persona a un fallo GPU y no repite la prueba cada frame", async () => {
    const empty = { faceLandmarks: [] };
    const gpu = { detectForVideo: vi.fn(() => empty), close: vi.fn() };
    const cpu = { detectForVideo: vi.fn(() => empty), close: vi.fn() };
    control.options.mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu);
    const runtime = await createMobileRuntime();
    for (let i = 1; i <= 6; i++) await runtime.step({} as ImageData, i / 30);
    expect(runtime.backend).toBe("main-gpu");
    expect(control.options).toHaveBeenCalledTimes(2);
    expect(cpu.close).toHaveBeenCalledOnce();
    runtime.stop();
  });

  it("mantiene timestamps crecientes en milisegundos para el seguimiento de video", async () => {
    const runtime = await createMobileRuntime();
    await runtime.step({} as ImageData, 1);
    await runtime.step({} as ImageData, 0.5);
    expect(control.detect.mock.calls[1][1]).toBeGreaterThan(control.detect.mock.calls[0][1]);
    expect(control.detect.mock.calls[0][1]).toBe(1000);
    runtime.stop();
  });

  it("aísla el canvas gráfico entre intentos y limita el error descargable sin URLs", async () => {
    control.detect.mockImplementationOnce(() => { throw new Error(`GPU https://example.test/private?token=secret ${"x".repeat(500)}`); });
    const first = await createMobileRuntime();
    const canvas = control.options.mock.calls[0][1].canvas;
    await first.step({} as ImageData, 1);
    expect(first.gpuError?.message).not.toContain("secret");
    expect(first.gpuError?.message).toHaveLength(400);
    first.stop();
    const second = await createMobileRuntime();
    expect(control.options.mock.calls[2][1].canvas).not.toBe(canvas);
    expect(second.gpuError).toBeNull();
    second.stop();
  });

});
