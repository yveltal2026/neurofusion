import type { BatteryReport } from "@/tools/battery/report/report";

/** Explicit allowlist: report.rows contains participant identifiers and must never reach AI. */
export function batteryAiAggregates(report: BatteryReport) {
  return {
    engineVersion: report.engineVersion,
    nParticipants: report.nParticipants,
    nIncluded: report.nIncluded,
    nExcluded: report.nExcluded,
    iat: report.iat,
    variants: report.variants,
    surveys: report.surveys,
    exposures: report.exposures,
    correlations: report.correlations,
    skipped: report.skipped,
    notes: report.notes,
  };
}
