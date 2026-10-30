import type { GazeResult } from "webeyetrack";
import type { LoadingStep } from "./loading";
import { InvalidEyeRegionError, isImageAllocationError, validateEyeRegion } from "./eye-region";
import { selectGazeBackend } from "./gaze-backend";
import type { Tensor } from "@tensorflow/tfjs-core";

export type MobileGazeReading = Pick<GazeResult, "facialLandmarks" | "gazeState" | "normPog" | "durations">;

// JS y WASM usan la misma versión. La GPU se usa en el hilo principal, sin el worker de WebEyeTrack.
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
  const options = {
    runningMode: "VIDEO" as const, numFaces: 1,
    // El modelo de expresiones no interviene en EAR, pose ni BlazeGaze.
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
  };
  // VisionTaskOptions exige un canvas GPU. Nunca se pide aquí un contexto 2D
  // ni se comparte con la copia de cámara o con TensorFlow.
  const gpuCanvas = document.createElement("canvas");
  let gpuError: { name: string; message: string } | null = null;
  const recordGpuError = (error: unknown) => {
    gpuError = error instanceof Error ? { name: error.name.slice(0, 80), message: error.message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 400) }
      : { name: "UnknownError", message: "GPU detection failed" };
  };
  let backend: "main-gpu" | "main-cpu" = "main-gpu";
  let detector: Awaited<ReturnType<typeof FaceLandmarker.createFromOptions>>;
  try {
    detector = await FaceLandmarker.createFromOptions(fileset, {
      ...options, canvas: gpuCanvas, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
    });
  } catch (error) {
    recordGpuError(error);
    checkCancelled();
    backend = "main-cpu";
    detector = await FaceLandmarker.createFromOptions(fileset, {
      ...options, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
    });
  }
  const runtime = new WebEyeTrack();
  // El paquete no ofrece inyección pública de detector. Este único acceso interno está
  // aislado y probado contra 0.0.2; nunca se ejecuta su initialize() que fuerza GPU.
  const internals = runtime as unknown as {
    faceLandmarkerClient: { initialize(): Promise<void>; processFrame(frame: ImageData): Promise<ReturnType<typeof detector.detect>> };
    blazeGaze: { model?: { dispose(): void }; predict(image: Tensor, head: Tensor, origin: Tensor): Tensor };
  };
  let detectorClosed = false;
  const closeDetector = () => { if (!detectorClosed) { detectorClosed = true; detector.close(); } };
  const dispose = () => { closeDetector(); internals.blazeGaze?.model?.dispose(); };
  let lastLandmarks: GazeResult["facialLandmarks"] = [];
  let timestampMs = -1;
  let emptyFrames = 0;
  let nextProbeAt = 0;
  let fallbackReason: string | null = backend === "main-cpu" ? "gpu-initialization-failed" : null;
  let gazeBackend: Awaited<ReturnType<typeof selectGazeBackend>> | null = null;
  try {
    checkCancelled();
    if (!("faceLandmarkerClient" in runtime)) throw new Error("La versión del motor no admite el detector móvil.");
    internals.faceLandmarkerClient = {
      initialize: async () => {},
      processFrame: async (frame) => {
        let result;
        try { result = detector.detectForVideo(frame, timestampMs); }
        catch (error) {
          if (backend !== "main-gpu") throw error;
          recordGpuError(error);
          checkCancelled();
          closeDetector();
          backend = "main-cpu";
          fallbackReason = "gpu-detection-error";
          detector = await FaceLandmarker.createFromOptions(fileset, {
            ...options, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
          });
          detectorClosed = false;
          checkCancelled();
          result = detector.detectForVideo(frame, timestampMs);
        }
        emptyFrames = result.faceLandmarks.length ? 0 : emptyFrames + 1;
        // Una respuesta vacía no demuestra que la GPU funcione. Comparar el mismo
        // frame con CPU distingue una incompatibilidad de una cámara sin persona.
        if (backend === "main-gpu" && emptyFrames >= 5 && performance.now() >= nextProbeAt) {
          nextProbeAt = performance.now() + 5000;
          let probe: typeof detector | null = null;
          let retained = false;
          try {
            probe = await FaceLandmarker.createFromOptions(fileset, {
              ...options, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
            });
            checkCancelled();
            const reference = probe.detectForVideo(frame, timestampMs);
            if (reference.faceLandmarks.length) {
              closeDetector();
              detector = probe;
              detectorClosed = false;
              retained = true;
              backend = "main-cpu";
              fallbackReason = "gpu-empty-cpu-detected-face";
              result = reference;
            }
          } catch {
            checkCancelled();
            fallbackReason = "cpu-probe-failed";
          } finally { if (probe && !retained) probe.close(); }
        }
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
    gazeBackend = await selectGazeBackend(internals.blazeGaze.predict.bind(internals.blazeGaze), signal, undefined, () => runtime.initialize());
    checkCancelled();
  } catch (error) {
    dispose();
    throw error;
  }
  let stopped = false;
  let pending: Promise<GazeResult> | null = null;
  return {
    get backend() { return backend; },
    get fallbackReason() { return fallbackReason; },
    get gpuError() { return gpuError; },
    get gazeBackend() { return gazeBackend; },
    trackingMode: "VIDEO",
    async step(frame: ImageData, timestamp: number): Promise<MobileGazeReading> {
      if (stopped) throw new Error("El detector móvil ya está detenido.");
      const from = performance.now();
      timestampMs = Math.max(timestampMs + 0.001, Number.isFinite(timestamp) ? timestamp * 1000 : from);
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
