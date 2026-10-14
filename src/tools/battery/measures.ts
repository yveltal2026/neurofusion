import { mean } from "@/tools/iat/engine/math";
import { getInstrument, type BlockScore, type SurveyConfig } from "@/tools/survey/engine";
import type { BatteryParticipant, MeasureDef } from "./engine/report";

/**
 * Del contenido de una batería a las medidas del informe integrado. Código puro: recibe los pasos con su
 * configuración y los datos ya leídos de cada sesión, y devuelve la lista de medidas y los participantes.
 */

export type ReportStep = { studyId: string; name: string; tool: "iat"; dimensionNames: string[] } | { studyId: string; name: string; tool: "survey"; config: SurveyConfig };

export interface IatSessionData {
  studyId: string;
  /** D por dimensión, con su validez. */
  dimensions: { d: number | null; valid: boolean }[];
}
export interface SurveySessionData {
  studyId: string;
  scores: BlockScore[];
}
export interface BatterySessionData {
  id: string;
  excluded: boolean;
  completed: boolean;
  iat: IatSessionData[];
  survey: SurveySessionData[];
}

const iatKey = (studyId: string) => `iat:${studyId}`;
const surveyKey = (studyId: string, blockId: string, part?: string) => `survey:${studyId}:${blockId}${part ? `:${part}` : ""}`;

/** Medidas que produce la batería, según sus pasos. Todas son medidas con participantes reales. */
export function reportMeasures(steps: readonly ReportStep[]): MeasureDef[] {
  const out: MeasureDef[] = [];
  for (const s of steps) {
    if (s.tool === "iat") {
      out.push({ key: iatKey(s.studyId), label: `IAT · ${s.name} (D medio)`, family: "implicit", evidence: "medido" });
      continue;
    }
    for (const b of s.config.blocks) {
      if (b.kind !== "instrument") continue;
      const name = getInstrument(b.instrumentId).name;
      const base = { family: "explicit" as const, evidence: "medido" as const };
      if (b.instrumentId === "sam") {
        out.push(
          { ...base, key: surveyKey(s.studyId, b.id, "valence"), label: `${name} · valencia` },
          { ...base, key: surveyKey(s.studyId, b.id, "arousal"), label: `${name} · activación` },
          { ...base, key: surveyKey(s.studyId, b.id, "dominance"), label: `${name} · dominio` },
        );
      } else {
        out.push({ ...base, key: surveyKey(s.studyId, b.id), label: `${name} · ${s.name}` });
      }
    }
  }
  return out;
}

/** D compuesto de un participante: media de las dimensiones con D (sólo las válidas, salvo que se pida incluir las dudosas). */
export function compositeD(dimensions: IatSessionData["dimensions"], includeInvalid: boolean): number | null {
  const ds = dimensions.filter((x) => x.d !== null && Number.isFinite(x.d) && (x.valid || includeInvalid)).map((x) => x.d as number);
  return ds.length ? mean(ds) : null;
}

export function toParticipants(sessions: readonly BatterySessionData[], opts: { includeInvalid?: boolean } = {}): BatteryParticipant[] {
  return sessions.map((s) => {
    const values: BatteryParticipant["values"] = {};
    for (const i of s.iat) values[iatKey(i.studyId)] = compositeD(i.dimensions, opts.includeInvalid ?? false);
    for (const sv of s.survey) {
      for (const b of sv.scores) {
        const sc = b.score;
        if (!sc) continue;
        switch (sc.instrument) {
          case "sus":
          case "attitude":
            values[surveyKey(sv.studyId, b.blockId)] = sc.score;
            break;
          case "nps":
          case "purchase_intent":
            values[surveyKey(sv.studyId, b.blockId)] = sc.value;
            break;
          case "sam":
            values[surveyKey(sv.studyId, b.blockId, "valence")] = sc.valence;
            values[surveyKey(sv.studyId, b.blockId, "arousal")] = sc.arousal;
            values[surveyKey(sv.studyId, b.blockId, "dominance")] = sc.dominance;
            break;
        }
      }
    }
    return { id: s.id, excluded: s.excluded, completed: s.completed, values };
  });
}
