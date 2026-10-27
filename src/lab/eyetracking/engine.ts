import type { GazeFrame } from "./metrics";

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
  start(video: HTMLVideoElement, onFrame: (frame: GazeFrame) => void): Promise<{ readyMs: number }>;
  stop(): void;
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

/**
 * Pide permiso de cámara por su cuenta. WebcamClient de la librería captura el error y solo lo imprime
 * en consola, así que sin este paso un permiso denegado se vería como «nunca llega ninguna lectura».
 */
export async function requestCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new EngineError(
      "Este navegador no permite usar la cámara aquí. La página debe abrirse por HTTPS (o localhost) y en un navegador reciente.",
      "camera-error",
    );
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new EngineError("Permiso de cámara denegado. Actívalo en los ajustes del navegador y vuelve a intentar.", "camera-denied");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new EngineError("No se encontró una cámara frontal en este dispositivo.", "camera-missing");
    }
    throw new EngineError(`No se pudo abrir la cámara (${name || "error desconocido"}).`, "camera-error");
  }
}

/** Verifica que los pesos estén servidos como JSON (si el proxy de auth los redirige, devuelve HTML). */
export async function checkModelAssets(url: string = WEBEYETRACK_MODEL_URL): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
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
export async function checkCdnReachable(urls: string[] = WEBEYETRACK_CDN_PROBES, timeoutMs = 10_000): Promise<void> {
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
const FIRST_FRAME_TIMEOUT_MS = 45_000;

export function createWebEyeTrackEngine(): GazeEngine {
  let webcam: { stopWebcam(): void } | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let worker: Worker | null = null;
  let active = false;

  return {
    id: "webeyetrack@0.0.2",
    calibration: "global-click",

    async start(video, onFrame) {
      // Import dinámico: el bundle de la librería toca `window`/`Worker` y no debe evaluarse en SSR.
      const { WebcamClient, WebEyeTrackProxy } = await import("webeyetrack");
      if (!video.id) video.id = "webeyetrack-video";
      videoElement = video;
      active = true;
      const startedAt = performance.now();

      const client = new WebcamClient(video.id);
      webcam = client;
      const proxy = new WebEyeTrackProxy(client);
      // v0.0.2 no expone destroy(); el worker existe en runtime aunque el tipo lo marque private.
      worker = (proxy as unknown as { worker?: Worker }).worker ?? null;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          active = false;
          reject(
            new EngineError(
              "No llegó ninguna lectura de mirada. Puede que el modelo de MediaPipe no se haya descargado (CDN bloqueado) o que no se detecte una cara.",
              "timeout",
            ),
          );
        }, FIRST_FRAME_TIMEOUT_MS);
        let first = true;

        proxy.onGazeResults = (result) => {
          if (!active) return;
          const t = performance.now();
          if (first) {
            first = false;
            clearTimeout(timer);
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
          });
        };
      });
    },

    stop() {
      active = false;
      // Al terminar el worker sus listeners globales no pueden seguir alterando la calibración.
      // La librería conserva un listener de clic (sin API para quitarlo), pero postMessage a
      // un Worker terminado es inocuo hasta que se abandona la página.
      webcam?.stopWebcam();
      webcam = null;
      worker?.terminate();
      worker = null;
      // WebcamClient sólo detiene los tracks; su bucle de frames sale cuando el video se pausa.
      videoElement?.pause();
      if (videoElement) videoElement.srcObject = null;
      videoElement = null;
    },
  };
}
