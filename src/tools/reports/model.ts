import type { SurveyAggregates } from "@/tools/survey/engine";
import type { EyeReportRecords } from "@/tools/eyetracking/results/load";
import { primaryFindings } from "@/tools/visual/analysis/findings";
import { CRITERIA_LABEL } from "@/tools/visual/analysis/piece";
import {
  aggregateEyeMetrics,
  EYE_METRICS_VERSION,
  mean,
} from "@/tools/visual/eye/metrics";
import type { VisualAsset } from "@/tools/visual/results";
import { REPORT_VERSION } from "./schema";

export function surveyReportSnapshot(
  title: string,
  aggregates: SurveyAggregates,
) {
  return {
    version: REPORT_VERSION,
    kind: "survey" as const,
    title,
    aggregates,
  };
}

export function eyeReportSnapshot(
  title: string,
  objective: string,
  assets: VisualAsset[],
  records: EyeReportRecords,
) {
  return {
    version: REPORT_VERSION,
    kind: "eye" as const,
    title,
    objective,
    engineVersion: EYE_METRICS_VERSION,
    counts: records.counts,
    assets: assets.map((asset) => {
      const input = records.runs.flatMap((run) =>
        run.observations
          .filter((o) => o.assetId === asset.row.id)
          .map((observation) => ({
            sessionId: run.id,
            participant: "",
            observation,
          })),
      );
      const measured = aggregateEyeMetrics(input, asset.aois, {
        width: asset.row.width,
        height: asset.row.height,
      });
      return {
        id: asset.row.id,
        title: asset.row.title,
        participants: measured.count,
        withoutFixations: measured.withoutFixations,
        meanFixations: mean(
          measured.participants.map((p) => p.metrics.fixations.length),
        ),
        meanDurationMs: mean(
          measured.participants.map((p) => p.observation.durationMs),
        ),
        validReadingsPct: mean(
          measured.participants.flatMap((p) =>
            p.observation.framesTotal
              ? [(100 * p.observation.framesValid) / p.observation.framesTotal]
              : [],
          ),
        ),
        aois: measured.aois,
      };
    }),
  };
}
export type EyeReportSnapshot = ReturnType<typeof eyeReportSnapshot>;

export function visualReportSnapshot(
  title: string,
  objective: string,
  assets: VisualAsset[],
) {
  const analyzed = assets.filter((a) => a.result !== null);
  const criteria = (
    Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[]
  ).map((key) => ({
    key,
    label: CRITERIA_LABEL[key],
    mean: mean(analyzed.map((a) => a.result!.criteria[key].score)),
  }));
  return {
    version: REPORT_VERSION,
    kind: "visual" as const,
    title,
    objective,
    total: assets.length,
    analyzed: analyzed.length,
    pending: assets.length - analyzed.length,
    highPriorityIssues: analyzed.reduce(
      (n, a) =>
        n +
        primaryFindings(a.result!, a.aois).weaknesses.filter((issue) => issue.severity === "high").length,
      0,
    ),
    criteria,
    assets: assets.map((a) => ({
      id: a.row.id,
      title: a.row.title,
      analyzedAt: a.ai?.generatedAt ?? null,
      analysis: a.result
        ? {
            summary: a.result.summary,
            message: a.result.message,
            firstSeconds: a.result.firstSeconds,
            criteria: a.result.criteria,
            ...primaryFindings(a.result, a.aois),
            limitations: a.result.limitations,
          }
        : null,
    })),
  };
}
export type VisualReportSnapshot = ReturnType<typeof visualReportSnapshot>;
export type ReportSnapshot =
  | ReturnType<typeof surveyReportSnapshot>
  | EyeReportSnapshot
  | VisualReportSnapshot;

export function reportEligibility(snapshot: ReportSnapshot): {
  ready: boolean;
  reason: string;
  units: number;
} {
  const units =
    snapshot.kind === "survey"
      ? snapshot.aggregates.nIncluded
      : snapshot.kind === "eye"
        ? snapshot.counts.included
        : snapshot.analyzed;
  const minimum = snapshot.kind === "visual" ? 1 : 3;
  const unit =
    snapshot.kind === "visual"
      ? "pieza analizada"
      : snapshot.kind === "eye"
        ? "sesiones con datos utilizables"
        : "respuestas completas incluidas";
  return {
    ready: units >= minimum,
    units,
    reason:
      units >= minimum
        ? ""
        : `Para el reporte con IA se necesitan al menos ${minimum} ${unit} (hay ${units}). Las visualizaciones están disponibles desde el primer resultado.`,
  };
}
