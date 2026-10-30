import { median, percentile, type GazeFrame, type Point } from "./metrics";

/** A 10 lecturas/s una ventana fija de 800 ms nunca reúne las 10 muestras exigidas. */
export function fixationWindowMs(fps: number): number {
  return Math.max(800, Math.min(2200, Math.ceil(12_000 / (Number.isFinite(fps) && fps > 0 ? fps : 10))));
}

export interface FixationQuality {
  samples: number;
  durationMs: number;
  validRatio: number;
  dispersion: Point;
  drift: Point;
  saturation?: Point;
}
export interface CalibrationPair { gaze: Point; target: Point; phase?: "base" | "refinement"; quality?: FixationQuality }

/** Peso acotado para que una fijación ruidosa no domine el ajuste. */
export function fixationWeight(pair: CalibrationPair): number {
  const q = pair.quality;
  if (!q) return 1;
  if (q.saturation && Math.max(q.saturation.x, q.saturation.y) >= 0.2) return 0;
  const noise = (q.dispersion.x + q.dispersion.y) / 0.04;
  const drift = (q.drift.x + q.drift.y) / 0.025;
  return Math.max(0.1, Math.min(1, q.validRatio * Math.min(1, q.samples / 20) / (1 + noise ** 2 + drift ** 2)));
}

/** Revisión acotada a dos fijaciones claramente peores que la mediana. */
export function weakCalibrationPoints(pairs: CalibrationPair[]): number[] {
  const weights = pairs.map(fixationWeight);
  const limit = Math.min(0.35, median(weights) * 0.75);
  return weights.map((weight, index) => ({ weight, index })).filter((p) => p.weight < limit)
    .sort((a, b) => a.weight - b.weight).slice(0, 2).map((p) => p.index);
}

export function moveSaturatedTarget(target: Point, saturation: Point): Point | null {
  const next = {
    x: saturation.x >= 0.2 ? target.x * 0.65 + 0.5 * 0.35 : target.x,
    y: saturation.y >= 0.2 ? target.y * 0.65 + 0.5 * 0.35 : target.y,
  };
  return Math.hypot(next.x - target.x, next.y - target.y) < 0.01 ? null : next;
}
export interface AxisCorrection { gain: number; offset: number; r2: number }
export interface CalibrationFit {
  center: Point;
  scale: Point;
  x: number[];
  y: number[];
  refinement?: { x: AxisCorrection; y: AxisCorrection };
}

/** Puntos de ajuste interiores distintos de todos los objetivos de validación. */
export function refinementGrid(width: number, height: number): Point[] {
  return [[0.25, 0.25], [0.75, 0.75], [0.75, 0.25], [0.25, 0.75],
    [0.5, 0.25], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5], [0.5, 0.5]]
    .map(([x, y]) => ({ x: x * width, y: y * height }));
}

/** Ajuste afín regularizado, usando todas las fijaciones y sin reentrenar el modelo base. */
export function fitCalibration(pairs: CalibrationPair[]): CalibrationFit {
  if (pairs.length < 9) throw new Error("Faltan puntos de calibración.");
  const weights = pairs.map(fixationWeight);
  if (weights.some((w) => w === 0)) throw new Error("Repite las fijaciones saturadas antes de calibrar.");
  const total = weights.reduce((a, b) => a + b, 0);
  const center = {
    x: pairs.reduce((n, p, i) => n + weights[i] * p.gaze.x, 0) / total,
    y: pairs.reduce((n, p, i) => n + weights[i] * p.gaze.y, 0) / total,
  };
  const scale = {
    x: Math.sqrt(pairs.reduce((n, p, i) => n + weights[i] * (p.gaze.x - center.x) ** 2, 0) / total),
    y: Math.sqrt(pairs.reduce((n, p, i) => n + weights[i] * (p.gaze.y - center.y) ** 2, 0) / total),
  };
  if (scale.x < 0.005 || scale.y < 0.005) {
    throw new Error("La mirada quedó fija o casi fija. Recoloca la cámara y mejora la luz; vuelve a calibrar.");
  }
  const rows = pairs.map((p) => [(p.gaze.x - center.x) / scale.x, (p.gaze.y - center.y) / scale.y, 1]);
  const correlation = rows.reduce((n, r, i) => n + weights[i] * r[0] * r[1], 0) / total;
  if (Math.abs(correlation) > 0.98) throw new Error("No se distinguieron ambos ejes de la mirada. Repite la calibración sin mover la cabeza.");
  const solve = (axis: "x" | "y") => {
    const a = Array.from({ length: 3 }, (_, i) => [
      ...Array.from({ length: 3 }, (_, j) => rows.reduce((n, r, k) => n + weights[k] * r[i] * r[j], 0) + (i === j && i < 2 ? total / pairs.length * 0.01 : 0)),
      rows.reduce((n, r, k) => n + weights[k] * r[i] * pairs[k].target[axis], 0),
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
  const mapped = { x: fit.x[0] * x + fit.x[1] * y + fit.x[2], y: fit.y[0] * x + fit.y[1] * y + fit.y[2] };
  return fit.refinement ? {
    x: mapped.x * fit.refinement.x.gain + fit.refinement.x.offset,
    y: mapped.y * fit.refinement.y.gain + fit.refinement.y.offset,
  } : mapped;
}

/** Corrección por eje aprendida sólo de una nueva ronda de calibración, antes de validar. */
export function refineCalibration(base: CalibrationFit, pairs: CalibrationPair[]): CalibrationFit {
  if (pairs.length !== 9 || base.refinement) throw new Error("Repite la calibración completa antes del ajuste fino.");
  const mapped = pairs.map((p) => applyCalibration(base, p.gaze));
  const weights = pairs.map(fixationWeight);
  if (weights.some((w) => w === 0)) throw new Error("Repite las fijaciones saturadas antes del ajuste fino.");
  const total = weights.reduce((a, b) => a + b, 0);
  const fitAxis = (axis: "x" | "y"): AxisCorrection => {
    const mean = mapped.reduce((n, p, i) => n + weights[i] * p[axis], 0) / total;
    const targetMean = pairs.reduce((n, p, i) => n + weights[i] * p.target[axis], 0) / total;
    const variance = mapped.reduce((n, p, i) => n + weights[i] * (p[axis] - mean) ** 2, 0);
    const targetVariance = pairs.reduce((n, p, i) => n + weights[i] * (p.target[axis] - targetMean) ** 2, 0);
    const covariance = mapped.reduce((n, p, i) => n + weights[i] * (p[axis] - mean) * (pairs[i].target[axis] - targetMean), 0);
    const gain = covariance / variance;
    const r2 = covariance ** 2 / (variance * targetVariance);
    if (![gain, r2].every(Number.isFinite) || gain < 0.25 || gain > 4 || r2 < 0.5) {
      throw new Error("El ajuste fino no distingue bien las posiciones. Recolócate frente a la cámara y vuelve a calibrar.");
    }
    return { gain, offset: targetMean - gain * mean, r2 };
  };
  return { ...base, refinement: { x: fitAxis("x"), y: fitAxis("y") } };
}

/** Calidad de una ventana reciente de fijación, en coordenadas normalizadas del viewport. */
export function assessFixation(frames: GazeFrame[], from: number, to: number, viewport: { width: number; height: number }):
  { ok: true; gaze: Point; quality: FixationQuality } | { ok: false; reason: "unstable" | "saturated"; saturation?: Point } {
  const window = frames.filter((f) => f.t >= from && f.t <= to);
  const valid = window.filter((f) => f.x !== null && f.y !== null && Number.isFinite(f.x) && Number.isFinite(f.y));
  if (valid.length < 10 || !window.length || valid.length / window.length < 0.8
    || valid.at(-1)!.t - valid[0].t < 500 || to - valid.at(-1)!.t > 200) return { ok: false, reason: "unstable" };
  const points = valid.map((f) => ({ x: f.x! / viewport.width, y: f.y! / viewport.height }));
  const saturation = {
    x: points.filter((p) => p.x <= 0.000001 || p.x >= 0.999999).length / points.length,
    y: points.filter((p) => p.y <= 0.000001 || p.y >= 0.999999).length / points.length,
  };
  if (Math.max(saturation.x, saturation.y) >= 0.2) return { ok: false, reason: "saturated", saturation };
  const gaze = fixationMedian(points)!;
  const third = Math.floor(points.length / 3);
  const average = (part: Point[], axis: "x" | "y") => median(part.map((p) => p[axis]));
  const dispersion = {
    x: percentile(points.map((p) => Math.abs(p.x - gaze.x)), 0.9),
    y: percentile(points.map((p) => Math.abs(p.y - gaze.y)), 0.9),
  };
  const drift = {
    x: Math.abs(average(points.slice(0, third), "x") - average(points.slice(-third), "x")),
    y: Math.abs(average(points.slice(0, third), "y") - average(points.slice(-third), "y")),
  };
  if (dispersion.x > 0.04 || dispersion.y > 0.04 || drift.x > 0.025 || drift.y > 0.025) return { ok: false, reason: "unstable" };
  return { ok: true, gaze, quality: { samples: valid.length, durationMs: Math.round(valid.at(-1)!.t - valid[0].t), validRatio: valid.length / window.length, dispersion, drift, saturation } };
}

export function stableFixation(frames: GazeFrame[], from: number, to: number, viewport: { width: number; height: number }): { gaze: Point; quality: FixationQuality } | null {
  const result = assessFixation(frames, from, to, viewport);
  return result.ok ? { gaze: result.gaze, quality: result.quality } : null;
}

export function fixationMedian(points: Point[]): Point | null {
  return points.length < 5 ? null : { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)) };
}
