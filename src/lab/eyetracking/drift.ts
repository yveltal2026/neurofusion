import { median, pxToDeg, THRESHOLDS, type DeviceType, type FrameStats, type GazeFrame, type Geometry, type Point, type TargetResult } from "./metrics";

export interface DriftSummary {
  afterAssetCount: number;
  medianErrorDeg: number | null;
  maxErrorDeg: number | null;
  coverage: number;
  fps: number;
  validRatio: number;
  passed: boolean;
}
export interface DriftCheck extends DriftSummary { targets: TargetResult[] }

export function driftSummary(check: DriftCheck): DriftSummary {
  return { afterAssetCount: check.afterAssetCount, medianErrorDeg: check.medianErrorDeg,
    maxErrorDeg: check.maxErrorDeg, coverage: check.coverage, fps: check.fps, validRatio: check.validRatio, passed: check.passed };
}

export function driftTargets(width: number, height: number): Point[] {
  return [[0.35, 0.45], [0.65, 0.55], [0.5, 0.5]].map(([x, y]) => ({ x: x * width, y: y * height }));
}

/** Antes de empezar, cada dos piezas y al terminar. */
export function driftCheckpoints(assetCount: number): number[] {
  const checkpoints = [0];
  for (let n = 2; n < assetCount; n += 2) checkpoints.push(n);
  if (assetCount > 0) checkpoints.push(assetCount);
  return checkpoints;
}

export function driftFailures(check: Omit<DriftSummary, "passed">, device: DeviceType): string[] {
  const limit = THRESHOLDS.maxMedianErrorDeg[device];
  const reasons: string[] = [];
  if (check.coverage !== 1) reasons.push("No hubo suficientes lecturas en todos los puntos.");
  if (!Number.isFinite(check.fps) || check.fps < THRESHOLDS.minFps) reasons.push("La cámara o el equipo están entregando pocas lecturas.");
  if (!Number.isFinite(check.validRatio) || check.validRatio < 0.8) reasons.push("Se perdió la detección de los ojos durante la fijación. Revisa la luz y que tu cara se vea completa.");
  if (check.medianErrorDeg === null || !Number.isFinite(check.medianErrorDeg) || check.medianErrorDeg > limit) reasons.push("La desviación de la mirada supera la precisión requerida.");
  if (check.maxErrorDeg === null || !Number.isFinite(check.maxErrorDeg) || check.maxErrorDeg > limit * 1.5) reasons.push("Uno de los puntos quedó demasiado lejos de la mirada estimada.");
  return reasons;
}

export function driftPasses(check: Omit<DriftSummary, "passed">, device: DeviceType): boolean {
  return driftFailures(check, device).length === 0;
}

/** Mide sólo las fijaciones; las transiciones entre objetivos no cuentan como pérdida de cara. */
export function driftFrameStats(frames: GazeFrame[], windows: { from: number; to: number }[]): FrameStats {
  const selected = frames.filter((f) => windows.some((w) => f.t >= w.from && f.t < w.to));
  const durationMs = windows.reduce((n, w) => n + Math.max(0, w.to - w.from), 0);
  const valid = selected.filter((f) => f.x !== null && f.y !== null && Number.isFinite(f.x) && Number.isFinite(f.y));
  const inference = selected.flatMap((f) => f.inferenceMs !== null && Number.isFinite(f.inferenceMs) ? [f.inferenceMs] : []);
  return { fps: durationMs > 0 ? selected.length * 1000 / durationMs : 0,
    validRatio: selected.length ? valid.length / selected.length : 0,
    frames: selected.length, inferenceMsMedian: inference.length ? median(inference) : null };
}

/** Falta de medición explícita para finalizar con precisión limitada, nunca un control aprobado. */
export function unmeasuredDriftCheck(afterAssetCount: number): DriftCheck {
  return { afterAssetCount, medianErrorDeg: null, maxErrorDeg: null, coverage: 0, fps: 0, validRatio: 0, passed: false, targets: [] };
}

/** Sólo mide; estos objetivos nunca modifican la calibración. */
export function buildDriftCheck(afterAssetCount: number, targets: TargetResult[], stream: FrameStats, geometry: Geometry, device: DeviceType): DriftCheck {
  const errors = targets.flatMap((t) => t.errorPx === null ? [] : [pxToDeg(t.errorPx, geometry)]);
  const summary = {
    afterAssetCount,
    medianErrorDeg: errors.length ? median(errors) : null,
    maxErrorDeg: errors.length ? Math.max(...errors) : null,
    coverage: targets.length === 3 ? errors.length / 3 : 0,
    fps: stream.fps,
    validRatio: stream.validRatio,
  };
  return { ...summary, targets, passed: driftPasses(summary, device) };
}
