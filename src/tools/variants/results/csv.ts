import { toCsv, type CsvCell } from "@/lib/csv";
import type { VariantConfig } from "../config";
import type { VariantRecord } from "./load";

/**
 * CSV de resultados: una fila por participante, con la medida principal, la validez y las cifras de
 * cada bloque. Los excluidos y los marcados salen con sus banderas para que el analista decida.
 */
export function variantCsv(config: VariantConfig, records: readonly VariantRecord[]): string {
  type Column = { header: string; value: (r: VariantRecord) => CsvCell };
  const columns: Column[] = [
    { header: "participant_ref", value: (r) => r.participantRef },
    { header: "started_at", value: (r) => r.startedAt },
    { header: "completed_at", value: (r) => r.completedAt },
    { header: "device_type", value: (r) => r.deviceType },
    { header: "variant", value: () => config.variant },
    { header: "primary", value: (r) => r.primary },
    { header: "valid", value: (r) => (r.valid ? 1 : 0) },
    { header: "flags", value: (r) => r.flags.join(";") },
    { header: "excluded", value: (r) => (r.excluded ? 1 : 0) },
    { header: "excluded_reason", value: (r) => r.excludedReason },
    { header: "engine_version", value: (r) => r.scores.engineVersion },
  ];

  if (config.variant === "sc_iat") {
    const sc = (r: VariantRecord) => (r.scores.detail.kind === "sc_iat" ? r.scores.detail.result : null);
    columns.push(
      { header: "mean_rt_target_positive_ms", value: (r) => sc(r)?.meanTargetPositive },
      { header: "mean_rt_target_negative_ms", value: (r) => sc(r)?.meanTargetNegative },
      { header: "pooled_sd_ms", value: (r) => sc(r)?.pooledSd },
      { header: "n_used", value: (r) => sc(r)?.nUsed },
      { header: "error_rate", value: (r) => sc(r)?.errorRate },
      { header: "fast_fraction", value: (r) => sc(r)?.fastFraction },
    );
  } else if (config.variant === "gnat") {
    const g = (r: VariantRecord) => (r.scores.detail.kind === "gnat" ? r.scores.detail : null);
    config.concepts.forEach((_, ci) => {
      for (const pole of ["positive", "negative"] as const) {
        const block = (r: VariantRecord) => g(r)?.blocks.find((b) => b.conceptIdx === ci && b.pole === pole);
        const p = `c${ci + 1}_${pole}`;
        columns.push(
          { header: `${p}_dprime`, value: (r) => block(r)?.result.dPrime },
          { header: `${p}_hits`, value: (r) => block(r)?.counts.hits },
          { header: `${p}_misses`, value: (r) => block(r)?.counts.misses },
          { header: `${p}_false_alarms`, value: (r) => block(r)?.counts.falseAlarms },
          { header: `${p}_correct_rejections`, value: (r) => block(r)?.counts.correctRejections },
        );
      }
      columns.push({ header: `c${ci + 1}_contrast`, value: (r) => g(r)?.contrasts[ci] });
    });
    columns.push({ header: "pooled_dprime", value: (r) => g(r)?.pooled.dPrime }, { header: "anticipation_fraction", value: (r) => g(r)?.anticipationFraction });
  } else {
    const p = (r: VariantRecord) => (r.scores.detail.kind === "priming" ? r.scores.detail : null);
    const primes = ["control", ...config.concepts.map((_, i) => `c${i}`)];
    for (const prime of primes) {
      const cell = (r: VariantRecord) => p(r)?.byPrime.find((x) => x.prime === prime);
      columns.push(
        { header: `${prime}_bias_ms`, value: (r) => cell(r)?.biasMs },
        { header: `${prime}_mean_rt_positive_ms`, value: (r) => cell(r)?.meanPositive },
        { header: `${prime}_mean_rt_negative_ms`, value: (r) => cell(r)?.meanNegative },
      );
    }
    config.concepts.forEach((_, ci) => columns.push({ header: `c${ci + 1}_effect_ms`, value: (r) => p(r)?.effects[ci] }));
    columns.push({ header: "error_rate", value: (r) => p(r)?.errorRate });
  }

  return toCsv(
    columns.map((c) => c.header),
    records.map((r) => columns.map((c) => c.value(r))),
  );
}
