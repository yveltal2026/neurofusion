import { describe, expect, it } from "vitest";
import { webVisualConfigSchema } from "./config";

describe("webVisualConfigSchema", () => {
  it("acepta configuración válida con valores por defecto", () => {
    const parsed = webVisualConfigSchema.safeParse({
      objective: "Aumentar registros en la landing de prueba gratuita",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mode).toBe("single");
      expect(parsed.data.pageType).toBe("landing");
      expect(parsed.data.deviceFocus).toBe("desktop");
      expect(parsed.data.primaryCta).toBe("");
    }
  });

  it("acepta flujo multi-pantalla con CTA principal", () => {
    const parsed = webVisualConfigSchema.safeParse({
      mode: "flow",
      pageType: "checkout",
      deviceFocus: "both",
      objective: "Reducir abandono en el paso de pago",
      primaryCta: "Finalizar compra",
      brand: "Aesteros",
      audience: "Compradores recurrentes",
    });
    expect(parsed.success).toBe(true);
  });

  it("rechaza objetivo vacío", () => {
    const parsed = webVisualConfigSchema.safeParse({
      objective: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("rechaza pageType o deviceFocus inválidos", () => {
    expect(
      webVisualConfigSchema.safeParse({
        objective: "Validar hero",
        pageType: "unknown",
      }).success,
    ).toBe(false);

    expect(
      webVisualConfigSchema.safeParse({
        objective: "Validar hero",
        deviceFocus: "tv",
      }).success,
    ).toBe(false);
  });
});
