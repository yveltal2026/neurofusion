import { median, pxToDeg, THRESHOLDS, type DeviceType, type FrameStats, type Geometry, type Point, type TargetResult } from "./metrics";

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

export function driftPasses(check: Omit<DriftSummary, "passed">, device: DeviceType): boolean {
  const limit = THRESHOLDS.maxMedianErrorDeg[device];
  return check.coverage === 1 && check.fps >= THRESHOLDS.minFps && check.validRatio >= 0.8
    && check.medianErrorDeg !== null && check.medianErrorDeg <= limit
    && check.maxErrorDeg !== null && check.maxErrorDeg <= limit * 1.5;
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
