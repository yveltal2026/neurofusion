import type { EyeObservation } from "./schema";
import type { EyeMetrics } from "./metrics";

export interface HeatCell {
  x: number;
  y: number;
  strength: number;
}

/** Each participant contributes their count or duration divided by exposure time.
 * Thus sampling FPS has no weight and a longer fixation produces more time heat. */
export function buildFixationHeatmap(
  metrics: { metrics: EyeMetrics; observation: EyeObservation }[],
  mode: "count" | "duration",
  columns = 40,
  rows = 40,
): HeatCell[] {
  const bins = new Array<number>(columns * rows).fill(0);
  for (const participant of metrics) {
    for (const f of participant.metrics.fixations) {
      const x = Math.min(columns - 1, Math.floor(f.x * columns));
      const y = Math.min(rows - 1, Math.floor(f.y * rows));
      bins[y * columns + x] +=
        (mode === "count" ? 1 : f.durationMs) /
        Math.max(1, participant.observation.durationMs);
    }
  }
  const peak = Math.max(0, ...bins);
  return peak
    ? bins.flatMap((v, i) =>
        v
          ? [
              {
                x: ((i % columns) + 0.5) / columns,
                y: (Math.floor(i / columns) + 0.5) / rows,
                strength: v / peak,
              },
            ]
          : [],
      )
    : [];
}

/** Cada sesión pesa igual aunque un dispositivo produzca más fotogramas. */
export function buildEyeHeatmap(
  observations: EyeObservation[],
  columns = 32,
  rows = 20,
): HeatCell[] {
  const bins = Array.from({ length: columns * rows }, () => 0);
  for (const observation of observations) {
    if (!observation.samples.length) continue;
    for (const sample of observation.samples) {
      const x = Math.min(columns - 1, Math.floor(sample.x * columns));
      const y = Math.min(rows - 1, Math.floor(sample.y * rows));
      bins[y * columns + x] += 1 / observation.samples.length;
    }
  }
  const peak = Math.max(0, ...bins);
  if (peak === 0) return [];
  return bins.flatMap((value, i) =>
    value > 0
      ? [
          {
            x: ((i % columns) + 0.5) / columns,
            y: (Math.floor(i / columns) + 0.5) / rows,
            strength: Math.sqrt(value / peak),
          },
        ]
      : [],
  );
}
