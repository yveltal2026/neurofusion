import { describe, expect, it } from "vitest";
import { buildWebVisualContextText } from "./prompt";

describe("buildWebVisualContextText", () => {
  it("incluye tipo de vista, dispositivo, objetivo y CTA principal", () => {
    const text = buildWebVisualContextText(
      {
        mode: "single",
        pageType: "pricing",
        deviceFocus: "desktop",
        objective: "Comparar planes y convertir a prueba gratuita",
        primaryCta: "Comenzar gratis",
        brand: "Aesteros",
        audience: "Equipos de UX",
      },
      "Pricing Desktop",
      "Web · desktop 1440×900",
    );

    expect(text).toContain("Precios / Planes");
    expect(text).toContain("Escritorio (Desktop)");
    expect(text).toContain("Comenzar gratis");
    expect(text).toContain("Pricing Desktop");
    expect(text).toContain("above-the-fold");
  });
});
