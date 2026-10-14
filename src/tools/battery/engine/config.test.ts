import { describe, expect, it } from "vitest";
import {
  batteryConfigSchema,
  defaultBatteryConsent,
  hasBlockingWarnings,
  orderWarnings,
  runOrder,
  suggestOrder,
  type StepInfo,
} from "./config";

const step = (over: Partial<StepInfo> & Pick<StepInfo, "studyId" | "tool">): StepInfo => ({
  name: over.studyId,
  enabled: true,
  studyStatus: "published",
  ...over,
});

describe("configuración", () => {
  it("valida textos y versión", () => {
    expect(batteryConfigSchema.safeParse({ version: 1, texts: { consent: defaultBatteryConsent("Café"), thankYou: "Gracias" } }).success).toBe(true);
    expect(batteryConfigSchema.safeParse({ version: 2, texts: { consent: "x", thankYou: "y" } }).success).toBe(false);
    expect(batteryConfigSchema.safeParse({ version: 1, texts: { consent: "", thankYou: "y" } }).success).toBe(false);
  });
  it("el consentimiento por defecto incluye el nombre y la mayoría de edad", () => {
    const c = defaultBatteryConsent("Café");
    expect(c).toContain("«Café»");
    expect(c).toContain("18 años");
  });
});

describe("orden sugerido", () => {
  it("pone el IAT antes de la encuesta y conserva el orden dentro de cada familia", () => {
    const steps = [
      step({ studyId: "s1", tool: "survey" }),
      step({ studyId: "i1", tool: "iat" }),
      step({ studyId: "s2", tool: "survey" }),
      step({ studyId: "i2", tool: "iat" }),
    ];
    expect(suggestOrder(steps).map((s) => s.studyId)).toEqual(["i1", "i2", "s1", "s2"]);
  });
  it("no modifica el arreglo original", () => {
    const steps = [step({ studyId: "s1", tool: "survey" }), step({ studyId: "i1", tool: "iat" })];
    suggestOrder(steps);
    expect(steps[0]!.studyId).toBe("s1");
  });
});

describe("avisos", () => {
  it("sin pasos activos es un error que bloquea", () => {
    const w = orderWarnings([step({ studyId: "i1", tool: "iat", enabled: false })]);
    expect(w.map((x) => x.code)).toEqual(["no_steps"]);
    expect(hasBlockingWarnings(w)).toBe(true);
  });
  it("un paso sin publicar bloquea; uno omitido no cuenta", () => {
    const draft = step({ studyId: "s1", tool: "survey", studyStatus: "draft" });
    expect(hasBlockingWarnings(orderWarnings([step({ studyId: "i1", tool: "iat" }), draft]))).toBe(true);
    expect(orderWarnings([step({ studyId: "i1", tool: "iat" }), { ...draft, enabled: false }]).map((x) => x.code)).toEqual(["single_step"]);
  });
  it("avisa cuando la encuesta va antes del IAT, sin bloquear", () => {
    const w = orderWarnings([step({ studyId: "s1", tool: "survey" }), step({ studyId: "i1", tool: "iat" })]);
    expect(w.map((x) => x.code)).toEqual(["explicit_before_implicit"]);
    expect(hasBlockingWarnings(w)).toBe(false);
  });
  it("no avisa con el orden sugerido", () => {
    expect(orderWarnings([step({ studyId: "i1", tool: "iat" }), step({ studyId: "s1", tool: "survey" })])).toEqual([]);
  });
  it("avisa de sesiones largas sumando sólo los pasos activos", () => {
    const steps = [step({ studyId: "i1", tool: "iat", minutes: 15 }), step({ studyId: "s1", tool: "survey", minutes: 10 })];
    expect(orderWarnings(steps).map((x) => x.code)).toEqual(["too_long"]);
    expect(orderWarnings([steps[0]!, { ...steps[1]!, enabled: false }]).map((x) => x.code)).toEqual(["single_step"]);
  });
  it("sugiere usar el estudio directo con un solo paso", () => {
    expect(orderWarnings([step({ studyId: "i1", tool: "iat" })]).map((x) => x.code)).toEqual(["single_step"]);
  });
});

describe("orden corrido", () => {
  it("son los pasos activos, en orden", () => {
    expect(runOrder([step({ studyId: "a", tool: "iat" }), step({ studyId: "b", tool: "survey", enabled: false }), step({ studyId: "c", tool: "survey" })])).toEqual(["a", "c"]);
  });
});
