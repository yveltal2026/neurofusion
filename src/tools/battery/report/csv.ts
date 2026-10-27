import { toCsv, type CsvCell } from "@/lib/csv";
import type { BatteryReport } from "./report";

const round = (n: number | null, digits = 4) =>
  n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Una fila por participante con su D por dimensión, la medida de cada variante del IAT, si vio las piezas de cada paso de exposición y sus métricas de encuesta. Va por código de
 * participación (`participant_ref`), sin IP, dispositivo ni user agent. Los excluidos salen con la
 * marca para que el análisis externo pueda decidir; no entran a los cálculos del informe.
 */
export function batteryReportCsv(report: BatteryReport): string {
  const dims = report.iat.map((d) => ({
    key: `${d.stepId}:${d.dimensionId}`,
    header: `iat_${d.stepName}_${d.dimensionName}_d`,
  }));
  const variants = report.variants.map((v) => ({
    key: `${v.stepId}:primary`,
    header: `variante_${v.stepName}_${v.measure}`,
  }));
  const exposures = report.exposures.map((e) => ({
    key: e.stepId,
    header: `exposicion_${e.stepName}_vio_piezas`,
  }));
  const metrics = report.metrics.map((m) => ({
    key: m.key,
    header: `encuesta_${m.label}`,
  }));
  const headers = [
    "participant_ref",
    "excluded",
    ...dims.map((d) => d.header),
    ...variants.map((v) => v.header),
    ...exposures.map((e) => e.header),
    ...metrics.map((m) => m.header),
  ];
  const rows: CsvCell[][] = report.rows.map((r) => [
    r.ref,
    r.excluded,
    ...dims.map((d) => round(r.d[d.key] ?? null)),
    ...variants.map((v) => round(r.d[v.key] ?? null)),
    ...exposures.map((e) => r.exposed[e.key] ?? false),
    ...metrics.map((m) => r.metrics[m.key] ?? null),
  ]);
  return toCsv(headers, rows);
}
