import { median, type Point } from "./metrics";

export interface CalibrationPair { gaze: Point; target: Point }
export interface CalibrationFit { center: Point; scale: Point; x: number[]; y: number[] }

/** Ajuste afín regularizado, usando todas las fijaciones y sin reentrenar el modelo base. */
export function fitCalibration(pairs: CalibrationPair[]): CalibrationFit {
  if (pairs.length < 9) throw new Error("Faltan puntos de calibración.");
  const center = {
    x: pairs.reduce((n, p) => n + p.gaze.x, 0) / pairs.length,
    y: pairs.reduce((n, p) => n + p.gaze.y, 0) / pairs.length,
  };
  const scale = {
    x: Math.sqrt(pairs.reduce((n, p) => n + (p.gaze.x - center.x) ** 2, 0) / pairs.length),
    y: Math.sqrt(pairs.reduce((n, p) => n + (p.gaze.y - center.y) ** 2, 0) / pairs.length),
  };
  if (scale.x < 0.005 || scale.y < 0.005) {
    throw new Error("La mirada quedó fija o casi fija. Recoloca la cámara y mejora la luz; vuelve a calibrar.");
  }
  const rows = pairs.map((p) => [(p.gaze.x - center.x) / scale.x, (p.gaze.y - center.y) / scale.y, 1]);
  const correlation = rows.reduce((n, r) => n + r[0] * r[1], 0) / pairs.length;
  if (Math.abs(correlation) > 0.98) throw new Error("No se distinguieron ambos ejes de la mirada. Repite la calibración sin mover la cabeza.");
  const solve = (axis: "x" | "y") => {
    const a = Array.from({ length: 3 }, (_, i) => [
      ...Array.from({ length: 3 }, (_, j) => rows.reduce((n, r) => n + r[i] * r[j], 0) + (i === j && i < 2 ? 0.01 : 0)),
      rows.reduce((n, r, k) => n + r[i] * pairs[k].target[axis], 0),
    ]);
    for (let i = 0; i < 3; i++) {
      const pivot = a[i][i];
      if (Math.abs(pivot) < 1e-8) throw new Error("No se pudo ajustar la calibración. Vuelve a intentar.");
      for (let j = i; j < 4; j++) a[i][j] /= pivot;
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        const factor = a[k][i];
        for (let j = i; j < 4; j++) a[k][j] -= factor * a[i][j];
      }
    }
    return a.map((r) => r[3]);
  };
  return { center, scale, x: solve("x"), y: solve("y") };
}

export function applyCalibration(fit: CalibrationFit, point: Point): Point {
  const x = (point.x - fit.center.x) / fit.scale.x;
  const y = (point.y - fit.center.y) / fit.scale.y;
  // No recortar: una predicción fuera de pantalla debe reflejarse en el error de validación.
  return { x: fit.x[0] * x + fit.x[1] * y + fit.x[2], y: fit.y[0] * x + fit.y[1] * y + fit.y[2] };
}

export function fixationMedian(points: Point[]): Point | null {
  return points.length < 5 ? null : { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)) };
}
