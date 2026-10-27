import type { EyeObservation } from "./schema";

export interface HeatCell { x: number; y: number; strength: number }

/** Cada sesión pesa igual aunque un dispositivo produzca más fotogramas. */
export function buildEyeHeatmap(observations: EyeObservation[], columns = 32, rows = 20): HeatCell[] {
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
  return bins.flatMap((value, i) => value > 0 ? [{
    x: ((i % columns) + 0.5) / columns,
    y: (Math.floor(i / columns) + 0.5) / rows,
    strength: Math.sqrt(value / peak),
  }] : []);
}
