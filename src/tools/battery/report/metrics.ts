import {
  listItems,
  type SurveyAnswers,
  type SurveyConfig,
} from "@/tools/survey/engine";
import {
  readInstrumentValues,
  scoreInstrument,
} from "@/tools/survey/engine/scoring";

/**
 * Métricas numéricas por participante que se pueden cruzar con el IAT. Cada una sale de un paso de
 * encuesta; la puntuación de los instrumentos la hace el motor determinista de la encuesta.
 */
export interface SurveyMetric {
  /** Único en la batería: `${studyId}:${clave}`. */
  key: string;
  stepId: string;
  label: string;
  /** Valor del participante, o null si no lo contestó. */
  extract: (answers: SurveyAnswers) => number | null;
}

const SHORT_NAME = {
  sus: "SUS (usabilidad)",
  nps: "NPS (recomendación 0–10)",
  sam: "SAM",
  purchase_intent: "Intención de compra",
  attitude: "Actitud",
} as const;

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function surveyMetrics(
  stepId: string,
  config: SurveyConfig,
): SurveyMetric[] {
  const out: SurveyMetric[] = [];
  const metric = (
    suffix: string,
    label: string,
    extract: SurveyMetric["extract"],
  ) => out.push({ key: `${stepId}:${suffix}`, stepId, label, extract });

  for (const block of config.blocks) {
    if (block.kind !== "instrument") continue;
    const name = SHORT_NAME[block.instrumentId];
    const score = (answers: SurveyAnswers) => {
      const values = readInstrumentValues(
        block.instrumentId,
        block.id,
        answers,
      );
      return values ? scoreInstrument(block.instrumentId, values) : null;
    };
    switch (block.instrumentId) {
      case "sus":
        metric(block.id, name, (a) => {
          const s = score(a);
          return s?.instrument === "sus" ? s.score : null;
        });
        break;
      case "nps":
        metric(block.id, name, (a) => {
          const s = score(a);
          return s?.instrument === "nps" ? s.value : null;
        });
        break;
      case "sam":
        for (const dim of ["valence", "arousal", "dominance"] as const) {
          const names = {
            valence: "valencia",
            arousal: "activación",
            dominance: "dominancia",
          };
          metric(`${block.id}:${dim}`, `${name} · ${names[dim]}`, (a) => {
            const s = score(a);
            return s?.instrument === "sam" ? s[dim] : null;
          });
        }
        break;
      case "purchase_intent":
        metric(block.id, name, (a) => {
          const s = score(a);
          return s?.instrument === "purchase_intent" ? s.value : null;
        });
        break;
      case "attitude":
        metric(block.id, name, (a) => {
          const s = score(a);
          return s?.instrument === "attitude" ? s.score : null;
        });
        break;
    }
  }

  // Escalas y números sueltos (no los ítems de instrumentos, que ya se reportan por instrumento).
  for (const item of listItems(config)) {
    if (item.type === "scale" && !item.instrument)
      metric(item.id, item.label, (a) => finite(a[item.id]));
    if (item.type === "number")
      metric(item.id, item.label, (a) => finite(a[item.id]));
  }
  return out;
}
