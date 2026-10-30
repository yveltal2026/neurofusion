import type { GazeResult } from "webeyetrack";
import type { LoadingStep } from "./loading";
import { InvalidEyeRegionError, isImageAllocationError, validateEyeRegion } from "./eye-region";

export type MobileGazeReading = Pick<GazeResult, "facialLandmarks" | "gazeState" | "normPog" | "durations">;

// JS y WASM deben usar la misma versión. No se usa el inicializador GPU de WebEyeTrack.
export const MOBILE_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function needsMobileRuntime(): boolean {
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Adaptador de WebEyeTrack 0.0.2: conserva BlazeGaze y cambia sólo la detección facial. */
export async function createMobileRuntime(onProgress: (step: LoadingStep) => void = () => {}, signal?: AbortSignal) {
  const checkCancelled = () => { if (signal?.aborted) throw new DOMException("Carga cancelada", "AbortError"); };
  onProgress("loading-code");
  const [{ FaceLandmarker, FilesetResolver }, { WebEyeTrack }] = await Promise.all([
    import("@mediapipe/tasks-vision"), import("webeyetrack"),
  ]);
  checkCancelled();
  onProgress("loading-detector");
  const fileset = await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
  checkCancelled();
  const detector = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
    runningMode: "IMAGE", numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  const runtime = new WebEyeTrack();
  // El paquete no ofrece inyección pública de detector. Este único acceso interno está
  // aislado y probado contra 0.0.2; nunca se ejecuta su initialize() que fuerza GPU.
  const internals = runtime as unknown as {
    faceLandmarkerClient: { initialize(): Promise<void>; processFrame(frame: ImageData): Promise<ReturnType<typeof detector.detect>> };
    blazeGaze: { model?: { dispose(): void } };
  };
  const dispose = () => { detector.close(); internals.blazeGaze?.model?.dispose(); };
  let lastLandmarks: GazeResult["facialLandmarks"] = [];
  try {
    checkCancelled();
    if (!("faceLandmarkerClient" in runtime)) throw new Error("La versión del motor no admite el detector móvil.");
    internals.faceLandmarkerClient = {
      initialize: async () => {},
      processFrame: async (frame) => {
        const result = detector.detect(frame);
        lastLandmarks = result.faceLandmarks[0] ?? [];
        return result;
      },
    };
    const prepareInput = runtime.prepareInput.bind(runtime);
    runtime.prepareInput = (frame, result) => {
      validateEyeRegion(frame.width, frame.height, result.faceLandmarks[0]);
      return prepareInput(frame, result);
    };
    onProgress("loading-gaze");
    await runtime.initialize();
    checkCancelled();
  } catch (error) {
    dispose();
    throw error;
  }
  let stopped = false;
  let pending: Promise<GazeResult> | null = null;
  return {
    async step(frame: ImageData, timestamp: number): Promise<MobileGazeReading> {
      if (stopped) throw new Error("El detector móvil ya está detenido.");
      const from = performance.now();
      pending = runtime.step(frame, timestamp);
      try { return await pending; }
      catch (error) {
        if (!(error instanceof InvalidEyeRegionError) && !isImageAllocationError(error)) throw error;
        // Una pose degenerada invalida sólo esta lectura, no apaga cámara ni motor.
        return { facialLandmarks: lastLandmarks, gazeState: "closed", normPog: [0, 0], durations: { total: performance.now() - from } };
      } finally { pending = null; }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      // No liberar WASM/tensores mientras una inferencia los está usando.
      if (pending) void pending.then(dispose, dispose);
      else dispose();
    },
  };
}

export type MobileRuntime = Awaited<ReturnType<typeof createMobileRuntime>>;
