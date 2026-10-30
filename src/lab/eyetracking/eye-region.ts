type Landmark = { x: number; y: number };
type Point = [number, number];

export class InvalidEyeRegionError extends Error {
  constructor() { super("No se obtuvo un recorte de ojos válido en este frame."); this.name = "InvalidEyeRegionError"; }
}

/** Homografía de cuatro puntos; pivoteo y entradas normalizadas evitan ajustes degenerados. */
function homography(source: Point[]): number[] {
  const target: Point[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  const rows = source.flatMap(([u, v], i) => {
    const [x, y] = target[i];
    return [[u, v, 1, 0, 0, 0, -x * u, -x * v, x], [0, 0, 0, u, v, 1, -y * u, -y * v, y]];
  });
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-8) throw new InvalidEyeRegionError();
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j <= 8; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j <= 8; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return [...rows.map((row) => row[8]), 1];
}

/**
 * Prevalida el recorte de obtainEyePatch() de WebEyeTrack 0.0.2 antes de que asigne
 * ImageData(512, alto). El alto original procede de una proyección sin límites.
 * No recorta ni corrige landmarks inválidos: ese frame debe descartarse.
 */
export function validateEyeRegion(width: number, height: number, landmarks: Landmark[]): void {
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height) || landmarks.length < 478) throw new InvalidEyeRegionError();
  if (landmarks.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new InvalidEyeRegionError();
  const point = (index: number): Point => [Math.floor(landmarks[index].x * width) / width, Math.floor(landmarks[index].y * height) / height];
  const nose = point(4);
  const quad = [103, 150, 379, 332].map((index): Point => {
    const [x, y] = point(index);
    return [x + (x - nose[0]) * 0.4, y + (y - nose[1]) * 0.2];
  });
  const cross = quad.map((p, i) => {
    const q = quad[(i + 1) % 4], r = quad[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  if (!cross.every((n) => n > 1e-5) && !cross.every((n) => n < -1e-5)) throw new InvalidEyeRegionError();
  const h = homography(quad);
  const projectY = (index: number) => {
    const [x, y] = point(index);
    const denominator = h[6] * x + h[7] * y + h[8];
    if (Math.abs(denominator) < 1e-5) throw new InvalidEyeRegionError();
    return (h[3] * x + h[4] * y + h[5]) / denominator * 512;
  };
  const top = projectY(151), bottom = projectY(195);
  const cropTop = Math.round(top), cropHeight = Math.round(bottom - top);
  if (!Number.isFinite(top + bottom) || cropHeight < 4 || cropTop < 0 || cropTop + cropHeight > 512) throw new InvalidEyeRegionError();
}

export function isImageAllocationError(error: unknown): boolean {
  return error instanceof Error && /ImageData|requested image size|supported range|Invalid typed array length/i.test(error.message)
    && (error instanceof RangeError || error.name === "IndexSizeError" || /Failed to construct.*ImageData/i.test(error.message));
}
