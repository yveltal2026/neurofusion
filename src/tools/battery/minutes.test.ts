import { describe, expect, it } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { estimateMinutes } from "@/tools/iat/engine/protocol";
import { DEFAULT_THANK_YOU, defaultConsentText } from "@/tools/survey/engine";
import { estimateStudyMinutes } from "./minutes";

describe("estimateStudyMinutes", () => {
  it("IAT: la estimación del protocolo más un minuto de formulario", () => {
    const c = demoConfig();
    expect(estimateStudyMinutes("iat", c)).toBe(estimateMinutes(c.protocol, c.dimensions.length) + 1);
  });

  it("encuesta: 12 s por pregunta, mínimo un minuto", () => {
    const survey = (n: number) => ({
      version: 1,
      title: "x",
      texts: { consent: defaultConsentText("x"), thankYou: DEFAULT_THANK_YOU },
      blocks: [
        {
          kind: "questions",
          id: "b1",
          questions: Array.from({ length: n }, (_, i) => ({ type: "text", id: `p${i}`, prompt: "q", required: false })),
        },
      ],
    });
    expect(estimateStudyMinutes("survey", survey(2))).toBe(1);
    expect(estimateStudyMinutes("survey", survey(30))).toBe(6);
  });

  it("devuelve 0 con una configuración inválida", () => {
    expect(estimateStudyMinutes("iat", {})).toBe(0);
    expect(estimateStudyMinutes("survey", null)).toBe(0);
  });
});
