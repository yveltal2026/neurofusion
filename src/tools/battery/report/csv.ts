import { toCsv, type CsvCell } from "@/lib/csv";
import type { BatteryReport } from "./report";

const round = (n: number | null, digits = 4) =>
  n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Una fila por participante con su D por dimensión y sus métricas de encuesta. Va por código de
 * participación (`participant_ref`), sin IP, dispositivo ni user agent. Los excluidos salen con la
 * marca para que el análisis externo pueda decidir; no entran a los cálculos del informe.
 */
export function batteryReportCsv(report: BatteryReport): string {
  const dims = report.iat.map((d) => ({
    key: `${d.stepId}:${d.dimensionId}`,
    header: `iat_${d.stepName}_${d.dimensionName}_d`,
  }));
  const metrics = report.metrics.map((m) => ({
    key: m.key,
    header: `encuesta_${m.label}`,
  }));
  const headers = [
    "participant_ref",
    "excluded",
    ...dims.map((d) => d.header),
    ...metrics.map((m) => m.header),
  ];
  const rows: CsvCell[][] = report.rows.map((r) => [
    r.ref,
    r.excluded,
    ...dims.map((d) => round(r.d[d.key] ?? null)),
    ...metrics.map((m) => r.metrics[m.key] ?? null),
  ]);
  return toCsv(headers, rows);
}
