import type { GazeFrame } from "./metrics";
import { createCameraSource } from "./camera";
import { createMobileRuntime, needsMobileRuntime, MOBILE_VISION_WASM, type MobileRuntime } from "./mobile-runtime";
import type { GazeResult } from "webeyetrack";
import { STARTUP_TIMEOUT_MS, type LoadingStep } from "./loading";

/**
 * Contrato mínimo que el resto del módulo exige a un motor de mirada. Existe para que cambiar de
 * WebEyeTrack al plan B (MediaPipe + regresión propia) no toque la UI ni las métricas.
 */
export interface GazeEngine {
  readonly id: string;
  /**
   * `global-click`: el motor aprende de cada clic/tap en la ventana (no hay API de calibración).
   * `explicit`: el motor expone una llamada para registrar un punto de calibración.
   */
  readonly calibration: "global-click" | "explicit";
  /** Carga modelos y abre la cámara sobre `video`. Resuelve con la primera lectura recibida. */
  start(video: HTMLVideoElement, onFrame: (frame: GazeFrame) => void, onError?: (error: EngineError) => void, onProgress?: (step: LoadingStep) => void): Promise<{ readyMs: number }>;
  stop(): void;
  diagnostics?(): unknown;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly kind: "camera-denied" | "camera-missing" | "camera-error" | "model-missing" | "timeout",
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/** Ruta fija desde la que WebEyeTrack 0.0.2 carga sus pesos (está escrita en el bundle de la librería). */
export const WEBEYETRACK_MODEL_URL = "/web/model.json";

/** Conserva mensajes accionables sin abrir una cámara adicional como comprobación. */
function cameraError(error: unknown): EngineError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new EngineError("Permiso de cámara denegado. Actívalo en los ajustes del navegador y vuelve a intentar.", "camera-denied");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new EngineError("No se encontró una cámara frontal en este dispositivo.", "camera-missing");
  }
  return new EngineError(error instanceof Error ? `No se pudo procesar la cámara: ${error.message}` : "No se pudo procesar la cámara. Vuelve a iniciarla.", "camera-error");
}

/** Verifica que los pesos estén servidos como JSON (si el proxy de auth los redirige, devuelve HTML). */
export async function checkModelAssets(url: string = WEBEYETRACK_MODEL_URL): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new EngineError(`No se pudo descargar el modelo (${url}). Revisa la conexión.`, "model-missing");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    throw new EngineError(
      `El modelo ${url} no se sirve correctamente (HTTP ${res.status}, ${type || "sin tipo"}). ¿Falta copiar public/web/?`,
      "model-missing",
    );
  }
}

/**
 * Recursos que la librería (v0.0.2) pide a terceros desde su worker, sin opción de cambiarlos.
 * Una red que los bloquee deja el worker colgado sin avisar, así que los probamos de antemano.
 */
export const WEBEYETRACK_CDN_PROBES = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm/vision_wasm_internal.js",
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
];

/** Falla rápido (y con el host culpable) si la red bloquea alguno de los CDN de los modelos. */
export async function checkCdnReachable(urls: string[] = needsMobileRuntime() ? [`${MOBILE_VISION_WASM}/vision_wasm_internal.js`, WEBEYETRACK_CDN_PROBES[1]] : WEBEYETRACK_CDN_PROBES, timeoutMs = 10_000): Promise<void> {
  const blocked: string[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        // no-cors: basta con que la conexión se establezca; la respuesta es opaca y no se lee.
        await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        blocked.push(new URL(url).host);
      }
    }),
  );
  if (blocked.length) {
    throw new EngineError(
      `Esta red no deja descargar los modelos de MediaPipe (${blocked.join(", ")}). Prueba con otra red (datos móviles) o pide que se desbloqueen esos dominios.`,
      "model-missing",
    );
  }
}

/** Segundos que esperamos la primera lectura antes de declarar fallo (descarga de modelos incluida). */
const FIRST_FRAME_TIMEOUT_MS = STARTUP_TIMEOUT_MS;

export function createWebEyeTrackEngine(): GazeEngine {
  let webcam: { stopWebcam(): void; diagnostics?(): unknown } | null = null;
  let worker: Worker | null = null;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectStart: ((error: EngineError) => void) | null = null;
  let generation = 0;
  let mobileRuntime: MobileRuntime | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let videoForDiagnostics: HTMLVideoElement | null = null;
  const timingSamples: Record<string, number[]> = { faceLandmarker: [], prepareInput: [], blazeGaze: [], kalmanFilter: [], total: [] };
  const readingTimes: number[] = [];
  const decodedCounts: Array<number | null> = [];
  let loadingController: AbortController | null = null;

  function release() {
    active = false;
    loadingController?.abort();
    loadingController = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (watchdog) clearInterval(watchdog);
    watchdog = null;
    mobileRuntime?.stop();
    mobileRuntime = null;
    webcam?.stopWebcam();
    webcam = null;
    worker?.terminate();
    worker = null;
  }

  return {
    id: "webeyetrack@0.0.2",
    calibration: "global-click",

    diagnostics() {
      const settings = (videoForDiagnostics?.srcObject as MediaStream | null)?.getVideoTracks?.()[0]?.getSettings?.();
      return {
        engine: "webeyetrack@0.0.2",
        detectorBackend: mobileRuntime?.backend ?? (worker ? "worker-gpu" : "not-running"),
        camera: { width: videoForDiagnostics?.videoWidth ?? 0, height: videoForDiagnostics?.videoHeight ?? 0, requestedFps: 30, reportedFps: settings?.frameRate ?? null,
          decodedFps: readingTimes.length > 1 && decodedCounts[0] !== null && decodedCounts.at(-1) != null && readingTimes.at(-1)! > readingTimes[0]
            ? (decodedCounts.at(-1)! - decodedCounts[0]!) * 1000 / (readingTimes.at(-1)! - readingTimes[0]) : null },
        capture: webcam?.diagnostics?.() ?? null,
        readings: readingTimes.length,
        processedFps: readingTimes.length > 1 && readingTimes.at(-1)! > readingTimes[0] ? (readingTimes.length - 1) * 1000 / (readingTimes.at(-1)! - readingTimes[0]) : null,
        meanStageMs: Object.fromEntries(Object.entries(timingSamples).map(([key, values]) => [key, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null])),
      };
    },
    async start(video, onFrame, onError, onProgress) {
      videoForDiagnostics = video;
      readingTimes.length = 0;
      decodedCounts.length = 0;
      for (const values of Object.values(timingSamples)) values.length = 0;
      // Import dinámico: el bundle de la librería toca `window`/`Worker` y no debe evaluarse en SSR.
      if (!navigator.mediaDevices?.getUserMedia) throw new EngineError(
        "Este navegador no permite usar la cámara aquí. Abre la página por HTTPS (o localhost) en un navegador reciente.", "camera-error",
      );
      const run = ++generation;
      const mobile = needsMobileRuntime();
      // En móvil no se crea el proxy ni el worker GPU de la biblioteca.
      const library = mobile ? null : await import("webeyetrack");
      if (run !== generation) throw new EngineError("Se canceló el inicio de la cámara.", "camera-error");
      if (!video.id) video.id = "webeyetrack-video";
      active = true;
      loadingController = new AbortController();
      const startedAt = performance.now();

      return new Promise((resolve, reject) => {
        rejectStart = reject;
        const fail = (error: EngineError) => {
          if (!active) return;
          const starting = rejectStart !== null;
          rejectStart?.(error);
          rejectStart = null;
          release();
          // También invalida la lectura si el fallo ocurre después del arranque.
          onFrame({ t: performance.now(), x: null, y: null, inferenceMs: null, faceDetected: false });
          if (!starting) onError?.(error);
        };
        const source = createCameraSource(video, (error) => fail(cameraError(error)), { square: mobile });
        webcam = source;
        timer = setTimeout(() => fail(new EngineError(
          "No llegó ninguna lectura de mirada. Revisa tu conexión y vuelve a iniciar la cámara con el rostro centrado e iluminado.",
          "timeout",
        )), FIRST_FRAME_TIMEOUT_MS);
        let lastResult = performance.now();
        watchdog = setInterval(() => {
          if (active && !rejectStart && performance.now() - lastResult > 8000) fail(new EngineError(
            "La cámara está activa, pero el análisis dejó de responder. Vuelve a iniciar la cámara. Si persiste, prueba de nuevo en Chrome actualizado.", "timeout",
          ));
        }, 1000);
        let first = true;

        const receive = (result: Pick<GazeResult, "facialLandmarks" | "gazeState" | "normPog" | "durations">) => {
          if (!active) return;
          const t = performance.now();
          lastResult = t;
          readingTimes.push(t);
          let decoded: number | null = null;
          try { decoded = video.getVideoPlaybackQuality?.().totalVideoFrames ?? null; } catch { /* No todos los navegadores exponen el contador. */ }
          decodedCounts.push(decoded);
          if (readingTimes.length > 120) { readingTimes.shift(); decodedCounts.shift(); }
          for (const [key, samples] of Object.entries(timingSamples)) {
            const duration = result.durations?.[key];
            if (Number.isFinite(duration)) { samples.push(duration); if (samples.length > 120) samples.shift(); }
          }
          if (first) {
            first = false;
            if (timer) clearTimeout(timer);
            timer = null;
            rejectStart = null;
            resolve({ readyMs: t - startedAt });
          }
          const open = result.gazeState === "open";
          const [nx, ny] = result.normPog;
          const valid = open && Number.isFinite(nx) && Number.isFinite(ny);
          onFrame({
            t,
            // normPog va de −0.5 a 0.5 con origen al centro de la ventana (eje Y hacia abajo).
            x: valid ? (nx + 0.5) * window.innerWidth : null,
            y: valid ? (ny + 0.5) * window.innerHeight : null,
            inferenceMs: result.durations?.total ?? null,
            faceDetected: result.facialLandmarks.length > 0,
          });
        };
        if (mobile) {
          let cameraReady = false;
          let runtimeReady = false;
          const runtimePromise = createMobileRuntime((step) => { if (active) onProgress?.(step); }, loadingController!.signal).then((runtime) => {
            if (!active || run !== generation) { runtime.stop(); return; }
            mobileRuntime = runtime;
            runtimeReady = true;
            onProgress?.(cameraReady ? "waiting-frame" : "starting-camera");
            return runtime;
          });
          // La cámara abre en paralelo: su permiso y reproducción no esperan a las descargas.
          onProgress?.("starting-camera");
          void source.startWebcam(async (frame, timestamp) => {
              try {
                const runtime = await runtimePromise;
                if (runtime && active) receive(await runtime.step(frame, timestamp));
              }
              catch (error) { fail(new EngineError(error instanceof Error ? `No se pudo analizar la cámara: ${error.message}` : "Falló el detector móvil.", "camera-error")); }
          }).then(() => { cameraReady = true; if (active && runtimeReady) onProgress?.("waiting-frame"); });
          void runtimePromise.catch((error) => fail(new EngineError(
            error instanceof Error ? `No se pudo cargar el detector móvil: ${error.message}` : "No se pudo cargar el detector móvil.", "model-missing",
          )));
        } else if (library) {
          onProgress?.("loading-detector");
          const client = new library.WebcamClient(video.id);
          client.startWebcam = source.startWebcam;
          client.stopWebcam = source.stopWebcam;
          const proxy = new library.WebEyeTrackProxy(client);
          worker = (proxy as unknown as { worker?: Worker }).worker ?? null;
          worker?.addEventListener("error", () => fail(new EngineError(
            "El detector se interrumpió. Vuelve a iniciar la cámara y revisa tu conexión.", "model-missing",
          )));
          proxy.onGazeResults = receive;
        }
      });
    },

    stop() {
      generation++;
      rejectStart?.(new EngineError("Se canceló el inicio de la cámara.", "camera-error"));
      rejectStart = null;
      release();
    },
  };
}
