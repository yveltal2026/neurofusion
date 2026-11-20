import { z } from "zod";
import {
  normalizeSampleToDocument,
  type NormalizedDocPoint,
  type RawWebGazeSample,
} from "./normalize";

export const stepEventSchema = z.object({
  stepId: z.string().trim().min(1).max(16),
  startedAtMs: z.number().int().min(0).max(3_600_000),
  completedAtMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
  completed: z.boolean().default(false),
  trigger: z.enum(["manual", "url_match", "hotspot", "timeout"]).default("manual"),
});

export type WebStepEvent = z.infer<typeof stepEventSchema>;

export interface StepSummaryMetric {
  stepId: string;
  attempts: number;
  completions: number;
  completionRate: number;
  meanDurationMs: number | null;
  gazeCount: number;
  clickCount: number;
}

export interface HeatmapCell {
  gx: number;
  gy: number;
  weight: number;
}

export interface WebEyetrackingAggregate {
  totalRuns: number;
  steps: StepSummaryMetric[];
  heatmapsByStep: Record<string, HeatmapCell[]>;
}

export interface RunInput {
  stepEvents: WebStepEvent[];
  samples: RawWebGazeSample[];
}

export function computeWebEyetrackingAggregate(
  runs: RunInput[],
  stepIds: string[],
  gridCols = 24,
  gridRows = 32,
): WebEyetrackingAggregate {
  const stepBuckets = new Map<
    string,
    { attempts: number; completions: number; durations: number[]; gaze: number; clicks: number }
  >();
  for (const id of stepIds) {
    stepBuckets.set(id, {
      attempts: 0,
      completions: 0,
      durations: [],
      gaze: 0,
      clicks: 0,
    });
  }

  const gridByStep = new Map<string, Map<string, number>>();
  for (const id of stepIds) {
    gridByStep.set(id, new Map());
  }

  for (const run of runs) {
    for (const ev of run.stepEvents) {
      const bucket = stepBuckets.get(ev.stepId);
      if (!bucket) continue;
      bucket.attempts += 1;
      if (ev.completed) {
        bucket.completions += 1;
        if (ev.completedAtMs !== null && ev.completedAtMs >= ev.startedAtMs) {
          bucket.durations.push(ev.completedAtMs - ev.startedAtMs);
        }
      }
    }

    for (const raw of run.samples) {
      const pt: NormalizedDocPoint = normalizeSampleToDocument(raw);
      const bucket = stepBuckets.get(pt.stepId);
      if (bucket) {
        if (pt.kind === "click") bucket.clicks += 1;
        else bucket.gaze += 1;
      }
      const grid = gridByStep.get(pt.stepId);
      if (grid && pt.kind === "gaze") {
        const gx = Math.min(gridCols - 1, Math.floor(pt.docX * gridCols));
        const gy = Math.min(gridRows - 1, Math.floor(pt.docY * gridRows));
        const key = `${gx}:${gy}`;
        grid.set(key, (grid.get(key) ?? 0) + 1);
      }
    }
  }

  const steps: StepSummaryMetric[] = stepIds.map((id) => {
    const b = stepBuckets.get(id)!;
    const meanDurationMs =
      b.durations.length > 0
        ? Math.round(b.durations.reduce((a, c) => a + c, 0) / b.durations.length)
        : null;
    return {
      stepId: id,
      attempts: b.attempts,
      completions: b.completions,
      completionRate: b.attempts > 0 ? b.completions / b.attempts : 0,
      meanDurationMs,
      gazeCount: b.gaze,
      clickCount: b.clicks,
    };
  });

  const heatmapsByStep: Record<string, HeatmapCell[]> = {};
  for (const id of stepIds) {
    const grid = gridByStep.get(id)!;
    let maxW = 0;
    for (const w of grid.values()) if (w > maxW) maxW = w;
    const cells: HeatmapCell[] = [];
    for (const [k, w] of grid.entries()) {
      const [gx, gy] = k.split(":").map(Number);
      cells.push({ gx, gy, weight: maxW > 0 ? w / maxW : 0 });
    }
    heatmapsByStep[id] = cells;
  }

  return {
    totalRuns: runs.length,
    steps,
    heatmapsByStep,
  };
}
