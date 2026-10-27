import type { Aoi } from "../engine/aoi";
import type { EyeObservation } from "./schema";

export const EYE_METRICS_VERSION = "idt-image-v1";
export const FIXATION_RULES = {
  minDurationMs: 100,
  maxGapMs: 100,
  dispersionDiagonal: 0.035,
} as const;
export interface ImageSize {
  width: number;
  height: number;
}
export interface Fixation {
  x: number;
  y: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  samples: number;
}
export interface GazeTransition {
  from: number;
  to: number;
  amplitudeDiagonalPct: number;
  durationMs: number;
}
export interface AoiMetrics {
  id: string;
  label: string;
  ttffMs: number | null;
  fixationCount: number;
  meanFixationDurationMs: number | null;
  totalFixationDurationMs: number;
  dwellTimeMs: number;
  visitCount: number;
  revisitCount: number;
  firstFixation: boolean;
}
export interface EyeMetrics {
  fixations: Fixation[];
  transitions: GazeTransition[];
  aois: AoiMetrics[];
}

/** I-DT: bounding-box diagonal in image space, corrected for image aspect ratio.
 * Never bridge missing readings or duplicate timestamps. Durations are observed
 * spans, with no extrapolation before the first or after the final sample. */
export function detectFixations(
  observation: EyeObservation,
  size: ImageSize,
): Fixation[] {
  const points = observation.samples;
  const diagonal = Math.hypot(size.width, size.height);
  if (!(diagonal > 0)) return [];
  const result: Fixation[] = [];
  const dispersion = (from: number, to: number) => {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let k = from; k <= to; k++) {
      x0 = Math.min(x0, points[k].x);
      x1 = Math.max(x1, points[k].x);
      y0 = Math.min(y0, points[k].y);
      y1 = Math.max(y1, points[k].y);
    }
    return (
      Math.hypot((x1 - x0) * size.width, (y1 - y0) * size.height) / diagonal
    );
  };
  const contiguous = (k: number) =>
    points[k].t > points[k - 1].t &&
    points[k].t - points[k - 1].t <= FIXATION_RULES.maxGapMs;
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (
      j + 1 < points.length &&
      points[j].t - points[i].t < FIXATION_RULES.minDurationMs &&
      contiguous(j + 1)
    )
      j++;
    if (
      points[j].t - points[i].t < FIXATION_RULES.minDurationMs ||
      dispersion(i, j) > FIXATION_RULES.dispersionDiagonal
    ) {
      i++;
      continue;
    }
    while (
      j + 1 < points.length &&
      contiguous(j + 1) &&
      dispersion(i, j + 1) <= FIXATION_RULES.dispersionDiagonal
    )
      j++;
    const segment = points.slice(i, j + 1);
    // Time-weighted centroid prevents variable sampling rates biasing location.
    const durationMs = points[j].t - points[i].t;
    let x = 0,
      y = 0;
    for (let k = i; k < j; k++) {
      const dt = points[k + 1].t - points[k].t;
      x += ((points[k].x + points[k + 1].x) / 2) * dt;
      y += ((points[k].y + points[k + 1].y) / 2) * dt;
    }
    result.push({
      x: x / durationMs,
      y: y / durationMs,
      startMs: points[i].t,
      endMs: points[j].t,
      durationMs,
      samples: segment.length,
    });
    i = j + 1;
  }
  return result;
}

function inside(point: { x: number; y: number }, aoi: Aoi) {
  return (
    point.x >= aoi.box[0] &&
    point.x <= aoi.box[2] &&
    point.y >= aoi.box[1] &&
    point.y <= aoi.box[3]
  );
}

export function measureEyeObservation(
  observation: EyeObservation,
  aois: Aoi[],
  size: ImageSize,
): EyeMetrics {
  const fixations = detectFixations(observation, size);
  const transitions: GazeTransition[] = [];
  for (let i = 1; i < fixations.length; i++) {
    const previous = fixations[i - 1],
      current = fixations[i];
    // Missing data is not evidence of a saccade. Require a continuous sample chain.
    const between = observation.samples.filter(
      (p) => p.t >= previous.endMs && p.t <= current.startMs,
    );
    if (
      between.some(
        (p, k) =>
          k > 0 &&
          (p.t <= between[k - 1].t ||
            p.t - between[k - 1].t > FIXATION_RULES.maxGapMs),
      )
    )
      continue;
    transitions.push({
      from: i - 1,
      to: i,
      amplitudeDiagonalPct:
        (100 *
          Math.hypot(
            (current.x - previous.x) * size.width,
            (current.y - previous.y) * size.height,
          )) /
        Math.hypot(size.width, size.height),
      durationMs: current.startMs - previous.endMs,
    });
  }
  return {
    fixations,
    transitions,
    aois: aois.map((aoi) => {
      const hits = fixations.filter((f) => inside(f, aoi));
      let visitCount = 0,
        dwellTimeMs = 0;
      let previous: Fixation | undefined;
      for (const hit of hits) {
        const between = previous
          ? observation.samples.filter(
              (p) => p.t >= previous!.endMs && p.t <= hit.startMs,
            )
          : [];
        const continues =
          previous &&
          between.every(
            (p, k) =>
              inside(p, aoi) &&
              (k === 0 ||
                (p.t > between[k - 1].t &&
                  p.t - between[k - 1].t <= FIXATION_RULES.maxGapMs)),
          );
        if (continues) dwellTimeMs += hit.startMs - previous!.endMs;
        else visitCount++;
        dwellTimeMs += hit.durationMs;
        previous = hit;
      }
      const totalFixationDurationMs = hits.reduce(
        (n, f) => n + f.durationMs,
        0,
      );
      return {
        id: aoi.id,
        label: aoi.label,
        ttffMs: hits[0]?.startMs ?? null,
        fixationCount: hits.length,
        meanFixationDurationMs: hits.length
          ? totalFixationDurationMs / hits.length
          : null,
        totalFixationDurationMs,
        dwellTimeMs,
        visitCount,
        revisitCount: Math.max(0, visitCount - 1),
        firstFixation: !!fixations[0] && inside(fixations[0], aoi),
      };
    }),
  };
}

export interface EyeParticipant {
  sessionId: string;
  participant: string;
  observation: EyeObservation;
}
export interface MeasuredParticipant extends EyeParticipant {
  metrics: EyeMetrics;
}
export interface AggregateAoi extends Omit<AoiMetrics, "firstFixation"> {
  viewers: number;
  hitRatePct: number | null;
  firstFixationPct: number | null;
}
export const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** One observation per session/asset. Empty recordings do not enter denominators;
 * recordings with gaze but no detected fixation do enter, contributing zeros. */
export function aggregateEyeMetrics(
  input: EyeParticipant[],
  aois: Aoi[],
  size: ImageSize,
) {
  const seen = new Set<string>();
  const participants: MeasuredParticipant[] = input
    .filter((p) => {
      if (!p.observation.samples.length || seen.has(p.sessionId)) return false;
      seen.add(p.sessionId);
      return true;
    })
    .map((p) => ({
      ...p,
      metrics: measureEyeObservation(p.observation, aois, size),
    }));
  const count = participants.length;
  const rows: AggregateAoi[] = aois.map((aoi, index) => {
    const values = participants.map((p) => p.metrics.aois[index]);
    const hits = values.filter((v) => v.fixationCount > 0);
    const fixationCount = values.reduce((n, v) => n + v.fixationCount, 0);
    return {
      id: aoi.id,
      label: aoi.label,
      viewers: hits.length,
      hitRatePct: count ? (hits.length / count) * 100 : null,
      firstFixationPct: count
        ? (values.filter((v) => v.firstFixation).length / count) * 100
        : null,
      ttffMs: mean(hits.map((v) => v.ttffMs!)),
      fixationCount: count ? fixationCount / count : 0,
      meanFixationDurationMs: fixationCount
        ? values.reduce((n, v) => n + v.totalFixationDurationMs, 0) /
          fixationCount
        : null,
      totalFixationDurationMs:
        mean(values.map((v) => v.totalFixationDurationMs)) ?? 0,
      dwellTimeMs: mean(values.map((v) => v.dwellTimeMs)) ?? 0,
      visitCount: mean(values.map((v) => v.visitCount)) ?? 0,
      revisitCount: mean(values.map((v) => v.revisitCount)) ?? 0,
    };
  });
  return {
    participants,
    aois: rows,
    count,
    withoutFixations: participants.filter((p) => !p.metrics.fixations.length)
      .length,
  };
}
