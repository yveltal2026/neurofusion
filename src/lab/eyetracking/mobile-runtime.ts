import type { GazeResult } from "webeyetrack";
import type { LoadingStep } from "./loading";
import { InvalidEyeRegionError, isImageAllocationError, validateEyeRegion } from "./eye-region";
import { selectGazeBackend } from "./gaze-backend";
import type { Tensor } from "@tensorflow/tfjs-core";
import { createFaceDetectorWorker, type CpuFaceWorker } from "./face-detector-client";
import { FACE_OPTIONS, FACE_LANDMARKER_MODEL, MOBILE_VISION_WASM } from "./face-detector-config";
import type { FaceDetection } from "./face-detector-protocol";

export type MobileGazeReading = Pick<GazeResult, "facialLandmarks" | "gazeState" | "normPog" | "durations">;

// JS y WASM usan la misma versión. La GPU se usa en el hilo principal, sin el worker de WebEyeTrack.
export { MOBILE_VISION_WASM, FACE_LANDMARKER_MODEL } from "./face-detector-config";

export function needsMobileRuntime(): boolean {
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Adaptador de WebEyeTrack 0.0.2: conserva BlazeGaze y cambia sólo la detección facial. */
export async function createMobileRuntime(onProgress: (step: LoadingStep) => void = () => {}, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const checkCancelled = () => { if (controller.signal.aborted) throw new DOMException("Carga cancelada", "AbortError"); };
  onProgress("loading-code");
  const [{ FaceLandmarker, FilesetResolver }, { WebEyeTrack }] = await Promise.all([
    import("@mediapipe/tasks-vision"), import("webeyetrack"),
  ]);
  checkCancelled();
  onProgress("loading-detector");
  const fileset = await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
  checkCancelled();
  const options = FACE_OPTIONS;
  // VisionTaskOptions exige un canvas GPU. Nunca se pide aquí un contexto 2D
  // ni se comparte con la copia de cámara o con TensorFlow.
  const gpuCanvas = document.createElement("canvas");
  let gpuError: { name: string; message: string } | null = null;
  const recordGpuError = (error: unknown) => {
    gpuError = error instanceof Error ? { name: error.name.slice(0, 80), message: error.message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 400) }
      : { name: "UnknownError", message: "GPU detection failed" };
  };
  let backend: "main-gpu" | "main-cpu" | "worker-cpu" = "main-gpu";
  let detector: Awaited<ReturnType<typeof FaceLandmarker.createFromOptions>> | undefined;
  let detectorClosed = false;
  let cpuWorker: CpuFaceWorker | null = null;
  let workerError: string | null = null;
  const closeDetector = () => { if (detector && !detectorClosed) { detectorClosed = true; detector.close(); } };
  const activateCpu = async () => {
    try {
      cpuWorker = await createFaceDetectorWorker(controller.signal);
      checkCancelled();
      backend = "worker-cpu";
    } catch (error) {
      checkCancelled();
      workerError = (error instanceof Error ? error.message : "Worker no disponible").replace(/https?:\/\/\S+/g, "[url]").slice(0, 400);
      detector = await FaceLandmarker.createFromOptions(fileset, { ...options,
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" } });
      detectorClosed = false;
      backend = "main-cpu";
    }
  };
  try {
    detector = await FaceLandmarker.createFromOptions(fileset, {
      ...options, canvas: gpuCanvas, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
    });
  } catch (error) {
    recordGpuError(error);
    checkCancelled();
    await activateCpu();
  }
  const runtime = new WebEyeTrack();
  // El paquete no ofrece inyección pública de detector. Este único acceso interno está
  // aislado y probado contra 0.0.2; nunca se ejecuta su initialize() que fuerza GPU.
  const internals = runtime as unknown as {
    faceLandmarkerClient: { initialize(): Promise<void>; processFrame(frame: ImageData): Promise<FaceDetection["result"]> };
    blazeGaze: { model?: { dispose(): void }; predict(image: Tensor, head: Tensor, origin: Tensor): Tensor };
  };
  const dispose = () => { controller.abort(); signal?.removeEventListener("abort", abort); cpuWorker?.close(); closeDetector(); internals.blazeGaze?.model?.dispose(); };
  let lastLandmarks: GazeResult["facialLandmarks"] = [];
  let timestampMs = -1;
  let emptyFrames = 0;
  let nextProbeAt = 0;
  let fallbackReason: string | null = backend !== "main-gpu" ? "gpu-initialization-failed" : null;
  let gazeBackend: Awaited<ReturnType<typeof selectGazeBackend>> | null = null;
  let prepared: FaceDetection["result"] | null = null;
  try {
    checkCancelled();
    if (!("faceLandmarkerClient" in runtime)) throw new Error("La versión del motor no admite el detector móvil.");
    internals.faceLandmarkerClient = {
      initialize: async () => {},
      processFrame: async (frame) => {
        if (prepared) { lastLandmarks = prepared.faceLandmarks[0] ?? []; return prepared; }
        let result;
        try { result = detector!.detectForVideo(frame, timestampMs); }
        catch (error) {
          if (backend !== "main-gpu") throw error;
          recordGpuError(error);
          checkCancelled();
          closeDetector();
          fallbackReason = "gpu-detection-error";
          await activateCpu();
          checkCancelled();
          // El primer fallo sucede dentro del step original, que aún usa frame:
          // se clona una vez; los siguientes se transfieren antes del step.
          result = cpuWorker ? (await cpuWorker.detect(frame, timestampMs, false)).result : detector!.detectForVideo(frame, timestampMs);
        }
        emptyFrames = result.faceLandmarks.length ? 0 : emptyFrames + 1;
        // Una respuesta vacía no demuestra que la GPU funcione. Comparar el mismo
        // frame con CPU distingue una incompatibilidad de una cámara sin persona.
        if (backend === "main-gpu" && emptyFrames >= 5 && performance.now() >= nextProbeAt) {
          nextProbeAt = performance.now() + 5000;
          let probe: NonNullable<typeof detector> | null = null;
          let retained = false;
          try {
            probe = await FaceLandmarker.createFromOptions(fileset, {
              ...options, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
            });
            checkCancelled();
            const reference = probe.detectForVideo(frame, timestampMs);
            if (reference.faceLandmarks.length) {
              closeDetector();
              try {
                cpuWorker = await createFaceDetectorWorker(controller.signal);
                checkCancelled(); backend = "worker-cpu";
              } catch (error) {
                checkCancelled();
                workerError = (error instanceof Error ? error.message : "Worker no disponible").replace(/https?:\/\/\S+/g, "[url]").slice(0, 400);
                detector = probe; detectorClosed = false; retained = true; backend = "main-cpu";
              }
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
    gazeBackend = await selectGazeBackend(internals.blazeGaze.predict.bind(internals.blazeGaze), controller.signal, undefined, () => runtime.initialize());
    checkCancelled();
  } catch (error) {
    dispose();
    throw error;
  }
  let stopped = false;
  let gazeQueue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;
  let requestTimestampMs = -1;
  return {
    get backend() { return backend; },
    get fallbackReason() { return fallbackReason; },
    get gpuError() { return gpuError; },
    get gazeBackend() { return gazeBackend; },
    get workerError() { return workerError; },
    get pipelined() { return cpuWorker !== null; },
    trackingMode: "VIDEO",
    step(frame: ImageData, timestamp: number): Promise<MobileGazeReading> {
      if (stopped) return Promise.reject(new Error("El detector móvil ya está detenido."));
      const from = performance.now();
      inFlight++;
      const ts = requestTimestampMs = Math.max(requestTimestampMs + 0.001, Number.isFinite(timestamp) ? timestamp * 1000 : from);
      // La detección del siguiente frame empieza aunque la mirada anterior siga
      // ejecutándose. El modelo de mirada y su filtro conservan orden y exclusión.
      const detection = cpuWorker?.detect(frame, ts);
      void detection?.catch(() => {});
      const pending = gazeQueue.then(async (): Promise<MobileGazeReading> => {
        checkCancelled();
        const detected = detection ? await detection : null;
        checkCancelled();
        timestampMs = ts; prepared = detected?.result ?? null;
        try {
          const result = await runtime.step(detected?.frame ?? frame, timestamp);
          return detected ? { ...result, durations: { ...result.durations, faceLandmarker: detected.detectorMs, total: performance.now() - from } } : result;
        } catch (error) {
          if (!(error instanceof InvalidEyeRegionError) && !isImageAllocationError(error)) throw error;
          return { facialLandmarks: lastLandmarks, gazeState: "closed", normPog: [0, 0], durations: { total: performance.now() - from } };
        } finally { prepared = null; }
      });
      gazeQueue = pending.catch(() => {});
      void pending.then(() => { inFlight--; }, () => { inFlight--; });
      return pending;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      controller.abort(); cpuWorker?.close();
      // No liberar WASM/tensores mientras una inferencia los está usando.
      if (inFlight) void gazeQueue.then(dispose, dispose);
      else dispose();
    },
  };
}

export type MobileRuntime = Awaited<ReturnType<typeof createMobileRuntime>>;
