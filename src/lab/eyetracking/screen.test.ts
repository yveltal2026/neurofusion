import { describe, expect, it } from "vitest";
import { screenWidthCm, screenWidthFromReference } from "./screen";

describe("medición física de pantalla", () => {
  it("usa el tamaño de la tarjeta en píxeles CSS sin depender de densidad ni orientación", () => {
    expect(screenWidthFromReference(300, 390)).toBeCloseTo(7.0174);
    expect(screenWidthFromReference(300, 844)).toBeCloseTo(15.18637);
    expect(screenWidthFromReference(150, 195)).toBeCloseTo(7.0174);
  });
  it.each([0, -1, NaN, Infinity])("rechaza referencias o pantallas inválidas: %s", (value) => {
    expect(screenWidthFromReference(value, 390)).toBeNaN();
    expect(screenWidthFromReference(300, value)).toBeNaN();
  });
  it("conserva la opción manual para monitores conocidos", () => {
    expect(screenWidthCm(27, "16:9", 1920, 1080)).toBeCloseTo(59.7726);
    expect(screenWidthCm(6.1, "auto", 390, 844)).toBeGreaterThan(6);
  });
});
