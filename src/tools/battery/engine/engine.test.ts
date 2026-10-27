import { describe, expect, it } from "vitest";
import {
  addStep,
  batteryConfigSchema,
  defaultBatteryConsentText,
  DEFAULT_BATTERY_THANK_YOU,
  isBatteryComplete,
  isBatteryTool,
  familyOf,
  isSuggestedOrder,
  moveStep,
  nextStep,
  orderWarnings,
  removeStep,
  runOrder,
  stepProgress,
  suggestOrder,
  TOOL_LABEL,
  toggleStep,
  validateComposition,
  MAX_STEPS,
  type BatteryStep,
} from "./index";

const iat = (id: string, enabled = true): BatteryStep => ({
  studyId: id,
  toolType: "iat",
  name: `IAT ${id}`,
  enabled,
});
const survey = (id: string, enabled = true): BatteryStep => ({
  studyId: id,
  toolType: "survey",
  name: `Encuesta ${id}`,
  enabled,
});
const variant = (id: string, enabled = true): BatteryStep => ({
  studyId: id,
  toolType: "iat_variant",
  name: `Variante ${id}`,
  enabled,
});
const visual = (id: string, enabled = true): BatteryStep => ({
  studyId: id,
  toolType: "visual",
  name: `Imagen ${id}`,
  enabled,
});
const ids = (steps: readonly BatteryStep[]) => steps.map((s) => s.studyId);

describe("orden sugerido", () => {
  it("pone las medidas implícitas antes que las explícitas", () => {
    expect(ids(suggestOrder([survey("s1"), iat("i1")]))).toEqual(["i1", "s1"]);
  });

  it("es estable: dentro de una familia respeta el orden que ya tenían", () => {
    expect(
      ids(suggestOrder([survey("s2"), iat("i2"), survey("s1"), iat("i1")])),
    ).toEqual(["i2", "i1", "s2", "s1"]);
  });

  it("no modifica la lista recibida y es idempotente", () => {
    const original = [survey("s1"), iat("i1")];
    const once = suggestOrder(original);
    expect(ids(original)).toEqual(["s1", "i1"]);
    expect(ids(suggestOrder(once))).toEqual(ids(once));
  });

  it("detecta si el orden actual ya es el sugerido", () => {
    expect(isSuggestedOrder([iat("i1"), survey("s1")])).toBe(true);
    expect(isSuggestedOrder([survey("s1"), iat("i1")])).toBe(false);
    expect(isSuggestedOrder([])).toBe(true);
  });

  it("incluye los pasos omitidos al ordenar (conservan su lugar relativo)", () => {
    expect(ids(suggestOrder([survey("s1", false), iat("i1")]))).toEqual([
      "i1",
      "s1",
    ]);
  });
});

describe("edición libre del investigador", () => {
  it("intercambia pasos y respeta los bordes", () => {
    const steps = [iat("a"), survey("b"), iat("c")];
    expect(ids(moveStep(steps, 0, 1))).toEqual(["b", "a", "c"]);
    expect(ids(moveStep(steps, 2, -1))).toEqual(["a", "c", "b"]);
    expect(ids(moveStep(steps, 0, -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveStep(steps, 2, 1))).toEqual(["a", "b", "c"]);
    expect(ids(moveStep(steps, 9, 1))).toEqual(["a", "b", "c"]);
  });

  it("omitir un paso lo conserva en su lugar; reactivarlo lo devuelve", () => {
    const steps = [iat("a"), survey("b"), iat("c")];
    const skipped = toggleStep(steps, "b");
    expect(ids(skipped)).toEqual(["a", "b", "c"]);
    expect(skipped.map((s) => s.enabled)).toEqual([true, false, true]);
    expect(runOrder(skipped)).toEqual(["a", "c"]);
    expect(toggleStep(skipped, "b").map((s) => s.enabled)).toEqual([
      true,
      true,
      true,
    ]);
    expect(steps[1]!.enabled).toBe(true); // inmutable
  });

  it("agrega al final y no duplica un estudio; quita por id", () => {
    let steps = addStep([], { studyId: "a", toolType: "iat", name: "A" });
    steps = addStep(steps, { studyId: "b", toolType: "survey", name: "B" });
    steps = addStep(steps, { studyId: "a", toolType: "iat", name: "A" });
    expect(ids(steps)).toEqual(["a", "b"]);
    expect(steps.every((s) => s.enabled)).toBe(true);
    expect(ids(removeStep(steps, "a"))).toEqual(["b"]);
    expect(ids(removeStep(steps, "zzz"))).toEqual(["a", "b"]);
  });

  it("el orden que corre el participante son los activos en el orden guardado", () => {
    expect(runOrder([survey("s1"), iat("i1", false), iat("i2")])).toEqual([
      "s1",
      "i2",
    ]);
    expect(runOrder([])).toEqual([]);
  });
});

describe("avisos metodológicos (no bloquean)", () => {
  it("avisa si una encuesta va antes de un IAT, nombrando ambos pasos", () => {
    const w = orderWarnings([survey("s1"), iat("i1")]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      code: "explicit_before_implicit",
      studyIds: ["s1", "i1"],
    });
    expect(w[0]!.message).toContain("«Encuesta s1»");
    expect(w[0]!.message).toContain("«IAT i1»");
  });

  it("no avisa con el orden sugerido", () => {
    expect(orderWarnings([iat("i1"), survey("s1")])).toEqual([]);
  });

  it("un paso omitido no genera aviso, porque el participante no lo vive", () => {
    expect(
      orderWarnings([survey("s1", false), iat("i1"), survey("s2")]),
    ).toEqual([]);
  });

  it("una encuesta DESPUÉS de varios IAT no avisa; antes de uno de ellos sí", () => {
    const w = orderWarnings([iat("i1"), survey("s1"), iat("i2")]);
    expect(w.map((x) => x.studyIds)).toEqual([["s1", "i2"]]);
  });

  it("avisa cuando sólo hay un paso activo", () => {
    expect(
      orderWarnings([iat("i1"), survey("s1", false)]).map((w) => w.code),
    ).toEqual(["single_active_step"]);
  });
});

describe("validación de la composición (sí bloquea)", () => {
  it("acepta una composición válida", () => {
    expect(validateComposition([iat("a"), survey("b", false)])).toEqual([]);
  });

  it("pide al menos un paso y al menos uno activo", () => {
    expect(validateComposition([])).toEqual(["Agrega al menos un paso."]);
    expect(validateComposition([iat("a", false), survey("b", false)])).toEqual([
      "Deja al menos un paso activo.",
    ]);
  });

  it("rechaza estudios repetidos y demasiados pasos", () => {
    expect(validateComposition([iat("a"), iat("a")])).toContain(
      "Un mismo estudio no puede aparecer dos veces.",
    );
    const many = Array.from({ length: MAX_STEPS + 1 }, (_, i) => iat(`i${i}`));
    expect(validateComposition(many).join(" ")).toContain(`${MAX_STEPS}`);
  });

  it("pueden ser pasos el IAT, sus variantes, la encuesta y la imagen con IA; el SEO no", () => {
    for (const tool of ["iat", "iat_variant", "survey", "visual"])
      expect(isBatteryTool(tool)).toBe(true);
    expect(isBatteryTool("seo")).toBe(false);
    expect(isBatteryTool("")).toBe(false);
  });
});

describe("los cuatro tipos de paso", () => {
  it("cada tipo tiene familia: exposición → implícita → explícita", () => {
    expect(familyOf(iat("a"))).toBe("implicit");
    expect(familyOf(variant("a"))).toBe("implicit");
    expect(familyOf(survey("a"))).toBe("explicit");
    expect(familyOf(visual("a"))).toBe("exposure");
  });

  it("el orden sugerido pone la imagen primero, luego IAT y variantes, y al final la encuesta", () => {
    expect(
      ids(suggestOrder([survey("s"), variant("v"), iat("i"), visual("x")])),
    ).toEqual(["x", "v", "i", "s"]);
  });

  it("avisa si una medida va antes de la exposición, sin impedir guardar", () => {
    const steps = [iat("i"), visual("x")];
    const w = orderWarnings(steps).find(
      (x) => x.code === "exposure_after_measure",
    );
    expect(w?.studyIds).toEqual(["i", "x"]);
    expect(w?.message).toContain("conviene mostrarlas primero");
    expect(validateComposition(steps)).toEqual([]);
    expect(
      orderWarnings([visual("x"), iat("i")]).map((x) => x.code),
    ).not.toContain("exposure_after_measure");
  });

  it("una variante cuenta como medida implícita para el aviso de explícita antes de implícita", () => {
    expect(
      orderWarnings([survey("s"), variant("v")]).map((w) => w.code),
    ).toContain("explicit_before_implicit");
  });

  it("los pasos omitidos no disparan avisos", () => {
    expect(
      orderWarnings([iat("i"), visual("x", false), survey("s")]).map(
        (w) => w.code,
      ),
    ).not.toContain("exposure_after_measure");
  });

  it("las etiquetas nombran los cuatro tipos", () => {
    expect(TOOL_LABEL).toEqual({
      iat: "IAT",
      iat_variant: "Variante del IAT",
      survey: "Encuesta",
      visual: "Imagen con IA",
    });
  });
});

describe("progreso del participante", () => {
  const order = ["a", "b", "c"];

  it("deriva el estado de cada paso de sus sesiones", () => {
    const p = stepProgress(order, [
      { studyId: "a", status: "completed" },
      { studyId: "b", status: "started" },
    ]);
    expect(p).toEqual([
      { studyId: "a", status: "completed" },
      { studyId: "b", status: "in_progress" },
      { studyId: "c", status: "pending" },
    ]);
    expect(nextStep(p)).toEqual({ studyId: "b", status: "in_progress" });
    expect(isBatteryComplete(p)).toBe(false);
  });

  it("una sesión abandonada se ignora y gana la más avanzada", () => {
    expect(
      stepProgress(["a"], [{ studyId: "a", status: "abandoned" }])[0]!.status,
    ).toBe("pending");
    expect(
      stepProgress(
        ["a"],
        [
          { studyId: "a", status: "abandoned" },
          { studyId: "a", status: "started" },
          { studyId: "a", status: "completed" },
        ],
      )[0]!.status,
    ).toBe("completed");
  });

  it("sesiones de estudios que no están en el orden no cuentan", () => {
    const p = stepProgress(["a"], [{ studyId: "zzz", status: "completed" }]);
    expect(p).toEqual([{ studyId: "a", status: "pending" }]);
  });

  it("completa sólo cuando todos los pasos están completados", () => {
    const done = stepProgress(
      order,
      order.map((studyId) => ({ studyId, status: "completed" })),
    );
    expect(isBatteryComplete(done)).toBe(true);
    expect(nextStep(done)).toBeNull();
    expect(isBatteryComplete([])).toBe(false);
  });
});

describe("configuración y consentimiento", () => {
  it("valida la configuración y rechaza textos vacíos", () => {
    const ok = {
      version: 1,
      title: "Estudio",
      texts: {
        consent: defaultBatteryConsentText("Estudio"),
        thankYou: DEFAULT_BATTERY_THANK_YOU,
      },
    };
    expect(batteryConfigSchema.safeParse(ok).success).toBe(true);
    expect(batteryConfigSchema.safeParse({ ...ok, title: "  " }).success).toBe(
      false,
    );
    expect(
      batteryConfigSchema.safeParse({
        ...ok,
        texts: { ...ok.texts, consent: "" },
      }).success,
    ).toBe(false);
    expect(batteryConfigSchema.safeParse({ ...ok, version: 2 }).success).toBe(
      false,
    );
  });

  it("el consentimiento por defecto es confidencial (no «anónimo») y pide 18 años o más", () => {
    const t = defaultBatteryConsentText("Mi estudio");
    expect(t).toContain("«Mi estudio»");
    expect(t).toContain("confidencial");
    expect(t).not.toMatch(/anónim/i);
    expect(t).toContain("18 años o más");
  });
});
