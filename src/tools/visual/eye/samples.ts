import type { GazeFrame } from "@/lab/eyetracking/metrics";
import type { EyeObservation } from "./schema";

export interface ImageRect { left: number; top: number; width: number; height: number }

/** Convierte lecturas de pantalla a coordenadas de la imagen visible. */
export function collectEyeObservation(
  assetId: string,
  frames: GazeFrame[],
  from: number,
  to: number,
  rect: ImageRect,
): EyeObservation {
  const inWindow = frames.filter((f) => f.t >= from && f.t <= to);
  const valid = inWindow.filter((f) => f.x !== null && f.y !== null && Number.isFinite(f.x) && Number.isFinite(f.y));
  const inImage = valid.flatMap((f) => {
    const x = (f.x! - rect.left) / rect.width;
    const y = (f.y! - rect.top) / rect.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1
      ? [{ t: Math.round(f.t - from), x, y }]
      : [];
  });
  // Reparte el límite por toda la exposición; cortar el arreglo sesgaría el mapa al comienzo.
  const maxSamples = 600;
  const samples = inImage.length <= maxSamples
    ? inImage
    : Array.from({ length: maxSamples }, (_, i) => inImage[Math.floor(i * (inImage.length - 1) / (maxSamples - 1))]);
  return {
    assetId,
    durationMs: Math.round(to - from),
    framesTotal: inWindow.length,
    framesValid: valid.length,
    samples,
  };
}
