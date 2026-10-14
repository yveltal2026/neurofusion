import { describe, expect, it } from "vitest";
import {
  detectableEffectOneSample,
  detectableEffectTwoMeans,
  effectLabel,
  marginOfError,
  nOneSample,
  nProportion,
  nTwoMeans,
  normalQuantile,
} from "./sample-size";

describe("normalQuantile", () => {
  it("coincide con valores de tabla", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.8)).toBeCloseTo(0.841621, 5);
    expect(normalQuantile(0.5)).toBe(0);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 5);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232, 5);
  });
  it("rechaza p fuera de (0, 1)", () => {
    expect(() => normalQuantile(0)).toThrow();
    expect(() => normalQuantile(1)).toThrow();
  });
});

describe("tamaños de muestra", () => {
  // Referencias: G*Power 3.1 (t de una muestra y de dos muestras independientes, dos colas).
  it("una muestra: d = 0.5, α = .05, potencia .80 → 34", () => {
    expect(nOneSample(0.5)).toBe(34);
  });
  it("una muestra: d = 0.2 → 199 (G*Power: 199)", () => {
    expect(Math.abs(nOneSample(0.2) - 199)).toBeLessThanOrEqual(1);
  });
  it("dos grupos: d = 0.5 → 64 por grupo", () => {
    expect(nTwoMeans(0.5)).toBe(64);
  });
  it("dos grupos: d = 0.8 → 26 por grupo (G*Power: 26)", () => {
    expect(Math.abs(nTwoMeans(0.8) - 26)).toBeLessThanOrEqual(1);
  });
  it("potencia .90 exige más muestra que .80", () => {
    expect(nOneSample(0.5, { power: 0.9 })).toBeGreaterThan(nOneSample(0.5));
  });
  it("proporción: p = .5, ±5 %, 95 % → 385", () => {
    expect(nProportion({ margin: 0.05 })).toBe(385);
  });
  it("proporción con población finita de 500 → 218", () => {
    expect(nProportion({ margin: 0.05, population: 500 })).toBe(218);
  });
  it("margen de error con 385 ≈ ±5 %", () => {
    expect(marginOfError(385)).toBeCloseTo(0.05, 2);
  });
  it("rechaza parámetros inválidos", () => {
    expect(() => nOneSample(0)).toThrow();
    expect(() => nProportion({ margin: 0 })).toThrow();
    expect(() => nProportion({ p: 1, margin: 0.05 })).toThrow();
  });
});

describe("efecto mínimo detectable", () => {
  it("es consistente con el tamaño de muestra (ida y vuelta)", () => {
    const d = detectableEffectOneSample(34)!;
    expect(d).toBeLessThanOrEqual(0.5);
    expect(nOneSample(d)).toBeLessThanOrEqual(34);
    const g = detectableEffectTwoMeans(64)!;
    expect(g).toBeLessThanOrEqual(0.5);
  });
  it("con 30 participantes sólo se detecta un efecto mediano o mayor", () => {
    expect(detectableEffectOneSample(30)!).toBeGreaterThan(0.5);
  });
  it("devuelve null si n es demasiado pequeño", () => {
    expect(detectableEffectOneSample(1)).toBeNull();
  });
});

describe("effectLabel", () => {
  it("clasifica por la convención de Cohen", () => {
    expect(effectLabel(0.1)).toBe("muy pequeño");
    expect(effectLabel(0.2)).toBe("pequeño");
    expect(effectLabel(0.5)).toBe("mediano");
    expect(effectLabel(0.9)).toBe("grande");
  });
});
