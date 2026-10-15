import { describe, expect, it } from "vitest";
import { variantConfigSchema, variantsForConceptCount } from "../config";
import { defaultVariantConfig, withConceptCount, withVariant } from "../defaults";
import { validateVariantStep } from "./validation";

describe("el wizard sólo permite combinaciones válidas", () => {
  it("pasar a dos conceptos con SC-IAT cambia a una variante que admite dos", () => {
    const c = withConceptCount(defaultVariantConfig("sc_iat", 1), 2);
    expect(c.concepts).toHaveLength(2);
    expect(variantsForConceptCount(2)).toContain(c.variant);
    expect(c.variant).not.toBe("sc_iat");
    expect(variantConfigSchema.safeParse(c).success).toBe(true);
  });

  it("volver a un concepto conserva la variante si la admite y descarta el segundo concepto", () => {
    const two = withConceptCount(defaultVariantConfig("gnat", 1), 2);
    expect(two.concepts).toHaveLength(2);
    const back = withConceptCount(two, 1);
    expect(back.variant).toBe("gnat");
    expect(back.concepts).toHaveLength(1);
    expect(variantConfigSchema.safeParse(back).success).toBe(true);
  });

  it("cambiar de variante conserva el contenido y reinicia los parámetros", () => {
    const base = defaultVariantConfig("gnat", 1);
    base.product = "café";
    base.concepts[0].label = "Marca Z";
    base.concepts[0].stimuli = ["Marca Z"];
    if (base.variant === "gnat") base.params.deadlineMs = 900;
    const next = withVariant(base, "priming");
    expect(next.variant).toBe("priming");
    expect(next.product).toBe("café");
    expect(next.concepts[0].label).toBe("Marca Z");
    expect(next.params).toMatchObject({ primeMs: 200, blankMs: 100 });
    expect(variantConfigSchema.safeParse(next).success).toBe(true);
  });

  it("al agregar un segundo concepto no copia el nombre del primero", () => {
    const c = withConceptCount(defaultVariantConfig("gnat", 1), 2);
    expect(new Set(c.concepts.map((x) => x.label)).size).toBe(2);
  });
});

describe("validación por paso", () => {
  it("cada error aparece en el paso que lo corrige", () => {
    const c = defaultVariantConfig("priming", 1);
    c.product = "";
    c.attribute.positiveWords = ["uno"];
    if (c.variant === "priming") c.params.primeMs = 5;
    c.texts.consent = "";
    expect(validateVariantStep("design", c)).toEqual([]);
    expect(validateVariantStep("content", c).length).toBeGreaterThanOrEqual(2);
    expect(validateVariantStep("params", c).length).toBeGreaterThanOrEqual(1);
    expect(validateVariantStep("texts", c).length).toBeGreaterThanOrEqual(1);
    // Los mensajes repetidos («Campo obligatorio») se muestran una sola vez.
    expect(validateVariantStep("confirm", c).length).toBeGreaterThanOrEqual(3);
  });

  it("una configuración válida no tiene errores en ningún paso", () => {
    const c = defaultVariantConfig("sc_iat", 1);
    for (const step of ["design", "content", "params", "texts", "confirm"] as const) expect(validateVariantStep(step, c)).toEqual([]);
  });

  it("un estímulo que también es palabra del atributo se señala en el contenido", () => {
    const c = defaultVariantConfig("gnat", 1);
    c.concepts[0].stimuli = ["Seguro"];
    expect(validateVariantStep("content", c).join(" ")).toMatch(/también es una palabra del atributo/);
  });
});
