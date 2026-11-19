import {
  computeFacialBaseline,
  evaluateFacialFrame,
  type BlendshapeMap,
  type FacialBaseline,
} from "@/lab/facial/blendshapes";
import type { VideoFacialSample, VideoGazeSample, VideoObservation } from "./schema";

export interface LiveVideoReading {
  x: number | null;
  y: number | null;
  gazeCapturedAt?: number;
  facialCapturedAt?: number;
  blendshapes?: BlendshapeMap | null;
  matrixData?: ArrayLike<number> | null;
}

/** Una cámara detenida no genera nuevas muestras mediante el reloj del video. */
export function isRecentReading(capturedAt: number | undefined, now: number): boolean {
  return capturedAt !== undefined && Number.isFinite(capturedAt) && now >= capturedAt && now - capturedAt <= 250;
}

export interface VideoContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MultimodalVideoFrame {
  /** Reloj del medio (`video.currentTime * 1000`), en ms desde el inicio del video. */
  videoTimeMs: number;
  /** Coordenadas de mirada en píxeles CSS del viewport (null si parpadeo o sin lectura). */
  x: number | null;
  y: number | null;
  /** 52 coeficientes ARKit devueltos por MediaPipe FaceLandmarker en el mismo frame. */
  blendshapes?: BlendshapeMap | null;
  /** Matriz 4×4 column-major de transformación facial para compuerta de pose. */
  matrixData?: ArrayLike<number> | null;
}

/**
 * Calcula el rectángulo real donde se pinta el video dentro de un elemento `<video>`
 * con `object-fit: contain`, descontando las barras de letterboxing o pillarboxing.
 */
export function computeVideoContentRect(
  container: VideoContentRect,
  intrinsicWidth: number,
  intrinsicHeight: number,
): VideoContentRect {
  if (
    !(container.width > 0) ||
    !(container.height > 0) ||
    !(intrinsicWidth > 0) ||
    !(intrinsicHeight > 0)
  ) {
    return container;
  }
  const containerAspect = container.width / container.height;
  const videoAspect = intrinsicWidth / intrinsicHeight;

  if (Math.abs(containerAspect - videoAspect) < 1e-4) {
    return container;
  }
  if (containerAspect > videoAspect) {
    // Pillarbox (barras laterales izquierda/derecha)
    const width = container.height * videoAspect;
    const left = container.left + (container.width - width) / 2;
    return { left, top: container.top, width, height: container.height };
  }
  // Letterbox (barras superior/inferior)
  const height = container.width / videoAspect;
  const top = container.top + (container.height - height) / 2;
  return { left: container.left, top, width: container.width, height };
}

/**
 * Convierte la traza multimodal recolectada durante la reproducción de un video
 * en un objeto `VideoObservation` validable por `videoObservationSchema`.
 */
export function collectVideoObservation(input: {
  assetId: string;
  durationMs: number;
  frames: readonly MultimodalVideoFrame[];
  baselineFrames?: readonly BlendshapeMap[];
  baseline?: FacialBaseline | null;
  rect: VideoContentRect;
  playbackStalls?: number;
  audioMuted?: boolean;
  facialBinMs?: number;
  maxGazeSamples?: number;
}): VideoObservation {
  const durationMs = Math.max(1000, Math.round(input.durationMs));
  const facialBinMs = Math.max(50, Math.round(input.facialBinMs ?? 100));
  const maxGazeSamples = Math.min(3600, Math.max(60, input.maxGazeSamples ?? 1800));

  const baseline =
    input.baseline ??
    (input.baselineFrames?.length
      ? computeFacialBaseline(input.baselineFrames)
      : null);

  const inWindow = input.frames.filter(
    (f) =>
      Number.isFinite(f.videoTimeMs) &&
      f.videoTimeMs >= 0 &&
      f.videoTimeMs <= durationMs,
  );

  const validGazeFrames = inWindow.filter(
    (f) =>
      f.x !== null &&
      f.y !== null &&
      Number.isFinite(f.x) &&
      Number.isFinite(f.y),
  );

  const rawGazeInVideo: VideoGazeSample[] = [];
  let lastGazeT = -1;
  for (const f of validGazeFrames) {
    if (!(input.rect.width > 0) || !(input.rect.height > 0)) continue;
    const x = (f.x! - input.rect.left) / input.rect.width;
    const y = (f.y! - input.rect.top) / input.rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    const t = Math.min(durationMs, Math.max(0, Math.round(f.videoTimeMs)));
    if (t < lastGazeT) continue;
    lastGazeT = t;
    rawGazeInVideo.push({
      t,
      x: Math.round(x * 10_000) / 10_000,
      y: Math.round(y * 10_000) / 10_000,
    });
  }

  const gazeSamples =
    rawGazeInVideo.length <= maxGazeSamples
      ? rawGazeInVideo
      : Array.from({ length: maxGazeSamples }, (_, i) =>
          rawGazeInVideo[
            Math.floor((i * (rawGazeInVideo.length - 1)) / (maxGazeSamples - 1))
          ],
        );

  // Agrupación de lecturas faciales en bins uniformes (p. ej. 100 ms = 10 Hz) con t estrictamente creciente
  const bins = new Map<
    number,
    Array<ReturnType<typeof evaluateFacialFrame>>
  >();
  for (const f of inWindow) {
    if (!f.blendshapes || !Object.keys(f.blendshapes).length) continue;
    const binIndex = Math.floor(f.videoTimeMs / facialBinMs);
    const binT = Math.min(durationMs, binIndex * facialBinMs);
    const evaluated = evaluateFacialFrame(f.blendshapes, {
      baseline,
      matrixData: f.matrixData,
    });
    let list = bins.get(binT);
    if (!list) {
      list = [];
      bins.set(binT, list);
    }
    list.push(evaluated);
  }

  const sortedBinTimes = [...bins.keys()].sort((a, b) => a - b).slice(0, 3000);
  const facialSamples: VideoFacialSample[] = sortedBinTimes.map((t) => {
    const items = bins.get(t)!;
    const validItems = items.filter((i) => i.poseValid);
    const pool = validItems.length ? validItems : items;
    const avg = (pick: (r: (typeof pool)[number]) => number) =>
      Math.min(
        100,
        Math.max(
          0,
          Math.round(pool.reduce((s, r) => s + pick(r), 0) / pool.length),
        ),
      );
    return {
      t,
      poseValid: validItems.length > 0,
      au01: avg((r) => r.au01),
      au02: avg((r) => r.au02),
      au04: avg((r) => r.au04),
      au06: avg((r) => r.au06),
      au07: avg((r) => r.au07),
      au09: avg((r) => r.au09),
      au10: avg((r) => r.au10),
      au12: avg((r) => r.au12),
      au14: avg((r) => r.au14),
      au15: avg((r) => r.au15),
      au24: avg((r) => r.au24),
      au26: avg((r) => r.au26),
      blink: items.some((r) => r.blink),
    };
  });

  return {
    assetId: input.assetId,
    durationMs,
    framesTotal: inWindow.length,
    framesValid: validGazeFrames.length,
    playbackStalls: Math.max(0, Math.round(input.playbackStalls ?? 0)),
    audioMuted: Boolean(input.audioMuted),
    baselineFrames: baseline?.sampleCount ?? 0,
    gazeSamples,
    facialSamples,
  };
}
