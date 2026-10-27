import type { GazeEngine } from "./engine";

/**
 * Motor simulado para probar el flujo (calibración, validación, resultados, exportación) sin cámara
 * ni descarga de modelos: la “mirada” es la posición del puntero más un desvío fijo y ruido.
 * Se activa con `/lab/eyetracking?engine=fake`. Sirve también para demos en equipos sin webcam.
 */
export const FAKE_OFFSET_PX = { x: 20, y: 0 };
export const FAKE_NOISE_PX = 6;
const FPS = 30;

export function createFakeEngine(): GazeEngine {
  let timer: ReturnType<typeof setInterval> | null = null;
  let onMove: ((e: PointerEvent) => void) | null = null;

  return {
    id: "fake-pointer",
    calibration: "global-click",

    start(_video, onFrame) {
      const startedAt = performance.now();
      const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      onMove = (e) => {
        pos.x = e.clientX;
        pos.y = e.clientY;
      };
      window.addEventListener("pointermove", onMove);

      return new Promise((resolve) => {
        let first = true;
        timer = setInterval(() => {
          const t = performance.now();
          onFrame({
            t,
            x: pos.x + FAKE_OFFSET_PX.x + (Math.random() * 2 - 1) * FAKE_NOISE_PX,
            y: pos.y + FAKE_OFFSET_PX.y + (Math.random() * 2 - 1) * FAKE_NOISE_PX,
            inferenceMs: 5,
          });
          if (first) {
            first = false;
            resolve({ readyMs: t - startedAt });
          }
        }, 1000 / FPS);
      });
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (onMove) window.removeEventListener("pointermove", onMove);
      onMove = null;
    },
  };
}
