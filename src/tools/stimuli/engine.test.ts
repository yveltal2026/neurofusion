import { describe, expect, it } from "vitest";
import { assignVariant, clickGrid, compareMeans, compareProportions, firstClickSuccess, wilson } from "./engine";

describe("asignación reproducible", () => {
  const variants = ["A", "B", "C"] as const;
  it("es una función pura de (índice, variantes, semilla)", () => {
    for (let i = 0; i < 30; i++) expect(assignVariant(i, variants, 42)).toBe(assignVariant(i, variants, 42));
  });
  it("cambia con la semilla", () => {
    const a = Array.from({ length: 60 }, (_, i) => assignVariant(i, variants, 1)).join("");
    const b = Array.from({ length: 60 }, (_, i) => assignVariant(i, variants, 2)).join("");
    expect(a).not.toBe(b);
  });
  it("cada bloque completo queda balanceado", () => {
    const size = variants.length * 2;
    for (let block = 0; block < 10; block++) {
      const got = Array.from({ length: size }, (_, k) => assignVariant(block * size + k, variants, 7));
      for (const v of variants) expect(got.filter((x) => x === v)).toHaveLength(2);
    }
  });
  it("el reparto total nunca se desbalancea más que un bloque", () => {
    const counts = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < 100; i++) counts[assignVariant(i, variants, 99)]++;
    const vals = Object.values(counts);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(2);
  });
  it("rechaza entradas inválidas", () => {
    expect(() => assignVariant(0, [], 1)).toThrow();
    expect(() => assignVariant(-1, variants, 1)).toThrow();
  });
});

describe("comparación de proporciones", () => {
  it("ejemplo clásico: 45/100 frente a 30/100", () => {
    const r = compareProportions(45, 100, 30, 100)!;
    expect(r.diff).toBeCloseTo(0.15, 10);
    // z agrupado: p = .375, se = √(.375·.625·.02) = .06847; z = 2.191 → p ≈ .0285
    expect(r.p).toBeCloseTo(0.0285, 3);
    expect(r.ci95[0]).toBeGreaterThan(0);
    expect(r.ci95[0]).toBeLessThan(0.15);
    expect(r.ci95[1]).toBeGreaterThan(0.15);
    // h = 2·asin(√.45) − 2·asin(√.30)
    expect(r.cohenH).toBeCloseTo(2 * Math.asin(Math.sqrt(0.45)) - 2 * Math.asin(Math.sqrt(0.3)), 10);
  });
  it("proporciones iguales: diferencia 0, p = 1 y el intervalo contiene el 0", () => {
    const r = compareProportions(30, 100, 30, 100)!;
    expect(r.diff).toBe(0);
    expect(r.p).toBeCloseTo(1, 6);
    expect(r.ci95[0]).toBeLessThan(0);
    expect(r.ci95[1]).toBeGreaterThan(0);
  });
  it("es antisimétrica al intercambiar los grupos", () => {
    const a = compareProportions(45, 100, 30, 120)!;
    const b = compareProportions(30, 120, 45, 100)!;
    expect(a.diff).toBeCloseTo(-b.diff, 12);
    expect(a.p).toBeCloseTo(b.p, 10);
  });
  it("sin variación no hay prueba", () => {
    expect(compareProportions(0, 50, 0, 50)!.p).toBe(1);
  });
  it("rechaza conteos imposibles", () => {
    expect(compareProportions(5, 3, 1, 3)).toBeNull();
    expect(compareProportions(1, 0, 1, 3)).toBeNull();
  });
  it("Wilson de 50/100 ≈ [.404, .596]", () => {
    const [lo, hi] = wilson(50, 100);
    expect(lo).toBeCloseTo(0.4038, 3);
    expect(hi).toBeCloseTo(0.5962, 3);
  });
});

describe("t de Welch", () => {
  it("ejemplo calculado a mano", () => {
    // a: 5,6,7,8,9 (media 7, var 2.5) · b: 3,4,5,6,7 (media 5, var 2.5)
    const r = compareMeans([5, 6, 7, 8, 9], [3, 4, 5, 6, 7])!;
    expect(r.diff).toBe(2);
    // se = √(2.5/5 + 2.5/5) = 1 → t = 2; df = 8
    expect(r.t).toBeCloseTo(2, 10);
    expect(r.df).toBeCloseTo(8, 10);
    // p de dos colas para t = 2, df = 8 ≈ 0.0805
    expect(r.p).toBeCloseTo(0.0805, 3);
    // d = 2 / √2.5
    expect(r.cohenD).toBeCloseTo(2 / Math.sqrt(2.5), 10);
    expect(r.hedgesG).toBeLessThan(r.cohenD);
    // IC: 2 ± 2.306·1
    expect(r.ci95[0]).toBeCloseTo(2 - 2.306, 2);
    expect(r.ci95[1]).toBeCloseTo(2 + 2.306, 2);
  });
  it("devuelve null con grupos muy pequeños o sin variación", () => {
    expect(compareMeans([1], [1, 2])).toBeNull();
    expect(compareMeans([3, 3], [3, 3])).toBeNull();
  });
  it("varianzas distintas ajustan los grados de libertad", () => {
    const r = compareMeans([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [5, 5.1, 4.9, 5.05])!;
    expect(r.df).toBeLessThan(10 + 4 - 2);
  });
});

describe("clics", () => {
  it("agrupa en rejilla y descarta clics fuera de la pieza", () => {
    const g = clickGrid(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 1, y: 1 }, // borde: cae en la última celda
        { x: 1.2, y: 0.5 },
        { x: NaN, y: 0.5 },
      ],
      2,
      2,
    );
    expect(g.total).toBe(3);
    expect(g.discarded).toBe(2);
    expect(g.counts).toEqual([
      [1, 0],
      [0, 2],
    ]);
  });
  it("éxito del primer clic con intervalo", () => {
    const target = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    const clicks = [
      ...Array.from({ length: 6 }, () => ({ x: 0.5, y: 0.5 })),
      ...Array.from({ length: 4 }, () => ({ x: 0.1, y: 0.9 })),
    ];
    const r = firstClickSuccess(clicks, target);
    expect(r.n).toBe(10);
    expect(r.hits).toBe(6);
    expect(r.rate).toBe(0.6);
    expect(r.ci95![0]).toBeLessThan(0.6);
    expect(r.ci95![1]).toBeGreaterThan(0.6);
  });
  it("sin clics válidos no hay tasa", () => {
    expect(firstClickSuccess([], { x: 0, y: 0, w: 1, h: 1 }).rate).toBeNull();
  });
  it("rechaza rejillas inválidas", () => {
    expect(() => clickGrid([], 0, 2)).toThrow();
  });
});
