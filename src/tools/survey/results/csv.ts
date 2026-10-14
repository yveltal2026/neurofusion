import { toCsv, type CsvCell } from "@/lib/csv";
import { slugify } from "@/tools/iat/config";
import { listItems, scoreSurvey, type SurveyConfig } from "../engine";
import type { SurveyRecord } from "./load";

/**
 * CSV de respuestas: una fila por participante. Las opciones múltiples salen como una
 * columna 0/1 por opción; los instrumentos añaden su puntuación calculada (SUS, categoría
 * NPS, intención en las dos categorías superiores, promedio de actitud). Las respuestas
 * excluidas se incluyen con `excluded = 1` para que el analista decida.
 */
export function surveyCsv(
  config: SurveyConfig,
  records: readonly SurveyRecord[],
): string {
  type Column = { header: string; value: (r: SurveyRecord) => CsvCell };
  const columns: Column[] = [
    { header: "participant_ref", value: (r) => r.participantRef },
    { header: "started_at", value: (r) => r.startedAt },
    { header: "completed_at", value: (r) => r.completedAt },
    { header: "device_type", value: (r) => r.deviceType },
    { header: "excluded", value: (r) => (r.excluded ? 1 : 0) },
    { header: "excluded_reason", value: (r) => r.excludedReason },
  ];

  for (const item of listItems(config)) {
    if (item.type === "multiselect") {
      const taken = new Set<string>();
      item.options.forEach((option, i) => {
        let key = slugify(option, `opcion_${i + 1}`);
        if (taken.has(key)) key = `${key}_${i + 1}`;
        taken.add(key);
        columns.push({
          header: `${item.id}_${key}`,
          value: (r) => {
            const v = r.answers[item.id];
            if (!Array.isArray(v)) return null; // sin responder
            return v.includes(option) ? 1 : 0;
          },
        });
      });
      continue;
    }
    columns.push({
      header: item.id,
      value: (r) => {
        const v = r.answers[item.id];
        return typeof v === "string" || typeof v === "number" ? v : null;
      },
    });
  }

  for (const block of config.blocks) {
    if (block.kind !== "instrument") continue;
    const scoreOf = (r: SurveyRecord) =>
      scoreSurvey(config, r.answers).find((s) => s.blockId === block.id)
        ?.score ?? null;
    switch (block.instrumentId) {
      case "sus":
      case "attitude":
        columns.push({
          header: `${block.id}_score`,
          value: (r) => {
            const s = scoreOf(r);
            return s && (s.instrument === "sus" || s.instrument === "attitude")
              ? s.score
              : null;
          },
        });
        break;
      case "nps":
        columns.push({
          header: `${block.id}_category`,
          value: (r) => {
            const s = scoreOf(r);
            return s?.instrument === "nps" ? s.category : null;
          },
        });
        break;
      case "purchase_intent":
        columns.push({
          header: `${block.id}_top2box`,
          value: (r) => {
            const s = scoreOf(r);
            return s?.instrument === "purchase_intent"
              ? s.topTwoBox
                ? 1
                : 0
              : null;
          },
        });
        break;
      case "sam":
        break; // sus tres ítems ya son sus puntuaciones
    }
  }

  return toCsv(
    columns.map((c) => c.header),
    records.map((r) => columns.map((c) => c.value(r))),
  );
}
