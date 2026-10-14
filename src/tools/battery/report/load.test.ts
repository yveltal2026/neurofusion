import { describe, expect, it } from "vitest";
import {
  defaultConsentText,
  DEFAULT_THANK_YOU,
  type SurveyConfig,
} from "@/tools/survey/engine";
import { assembleParticipants } from "./load";
import type { ReportStep } from "./report";

const config: SurveyConfig = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};
const steps: ReportStep[] = [
  {
    kind: "iat",
    studyId: "iat1",
    name: "IAT",
    conceptA: "Marca A",
    conceptB: "Marca B",
    dimensions: [
      { id: "a", name: "A", positiveLabel: "Bueno" },
      { id: "b", name: "B", positiveLabel: "Bueno" },
    ],
  },
  { kind: "survey", studyId: "sv1", name: "Encuesta", config },
];

describe("assembleParticipants", () => {
  const bs = [
    { id: "b1", participant_ref: "r1", excluded: false },
    { id: "b2", participant_ref: "r2", excluded: false },
    { id: "b3", participant_ref: "r3", excluded: true },
  ];
  const children = [
    { id: "c1i", battery_session_id: "b1", study_id: "iat1", excluded: false },
    { id: "c1s", battery_session_id: "b1", study_id: "sv1", excluded: false },
    { id: "c2i", battery_session_id: "b2", study_id: "iat1", excluded: true }, // excluido en el paso
    { id: "c2s", battery_session_id: "b2", study_id: "sv1", excluded: false },
    { id: "c3i", battery_session_id: "b3", study_id: "iat1", excluded: false },
  ];
  const results = [
    { session_id: "c1i", dimension_idx: 1, d_score: -0.2, valid: false },
    { session_id: "c1i", dimension_idx: 0, d_score: 0.4, valid: true },
    { session_id: "c2i", dimension_idx: 0, d_score: 0.1, valid: true },
  ];
  const answers = [
    { session_id: "c1s", answers: { nps_1: 9 } },
    { session_id: "c2s", answers: "no es un objeto" },
  ];
  const out = assembleParticipants(steps, bs, children, results, answers);

  it("pone un resultado por dimensión en el orden de la configuración, aunque lleguen desordenados", () => {
    expect(out[0]!.iat.iat1).toEqual([
      { d: 0.4, valid: true },
      { d: -0.2, valid: false },
    ]);
  });
  it("une las respuestas de la encuesta por participante", () => {
    expect(out[0]!.survey.sv1).toEqual({ nps_1: 9 });
  });
  it("una dimensión sin resultado queda en null y una respuesta malformada se ignora", () => {
    expect(out[1]!.iat.iat1).toEqual([{ d: 0.1, valid: true }, null]);
    expect(out[1]!.survey.sv1).toBeUndefined();
  });
  it("excluido a nivel batería o en cualquier paso; los pasos que no hizo quedan ausentes", () => {
    expect(out.map((p) => p.excluded)).toEqual([false, true, true]);
    expect(out[2]!.survey.sv1).toBeUndefined();
    expect(out[0]!.ref).toBe("r1");
  });
  it("no mezcla pasos de otros participantes", () => {
    expect(out[2]!.iat.iat1).toEqual([null, null]);
  });
});
