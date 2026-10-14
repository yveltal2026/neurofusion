import { describe, expect, it } from "vitest";
import { analyzeGaborGranger, analyzeVanWestendorp, isLogicalVw, isMonotoneGg, type VwResponse } from "./price";

const vw = (tooCheap: number, cheap: number, expensive: number, tooExpensive: number): VwResponse => ({ tooCheap, cheap, expensive, tooExpensive });

describe("Van Westendorp", () => {
  it("valida la lógica de una respuesta", () => {
    expect(isLogicalVw(vw(5, 10, 20, 30))).toBe(true);
    expect(isLogicalVw(vw(5, 10, 10, 10))).toBe(true);
    expect(isLogicalVw(vw(10, 5, 20, 30))).toBe(false);
    expect(isLogicalVw(vw(0, 5, 20, 30))).toBe(false);
    expect(isLogicalVw(vw(5, 10, 20, NaN))).toBe(false);
  });

  it("calcula PMC e IPP de un ejemplo a mano (dos respondentes)", () => {
    // r1: 5/10/20/30 · r2: 10/15/25/40 → ver desarrollo en el comentario del módulo.
    const r = analyzeVanWestendorp([vw(5, 10, 20, 30), vw(10, 15, 25, 40)]);
    expect(r.n).toBe(2);
    expect(r.pmc).toBeCloseTo(12.5, 10);
    expect(r.ipp).toBeCloseTo(17.5, 10);
    expect(r.pme).toBeCloseTo(25, 10);
    expect(r.opp).toBeCloseTo(15, 10);
  });

  it("excluye respuestas incoherentes y lo advierte", () => {
    const r = analyzeVanWestendorp([vw(5, 10, 20, 30), vw(30, 20, 10, 5)]);
    expect(r.n).toBe(1);
    expect(r.nExcluded).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/incoherentes/);
  });

  it("advierte con muestras pequeñas", () => {
    expect(analyzeVanWestendorp([vw(5, 10, 20, 30)]).warnings.join(" ")).toMatch(/inestables/);
  });

  it("con una muestra grande y simétrica el orden de los puntos es PMC ≤ OPP ≤ IPP ≤ PME", () => {
    // Población sintética: precios en una rejilla con ruido determinista.
    const rs: VwResponse[] = [];
    for (let i = 0; i < 200; i++) {
      const u = ((i * 37) % 100) / 100; // determinista, ~uniforme
      const base = 20 + u * 20;
      rs.push(vw(Math.round(base * 0.5), Math.round(base * 0.8), Math.round(base * 1.2), Math.round(base * 1.6)));
    }
    const r = analyzeVanWestendorp(rs);
    expect(r.nExcluded).toBe(0);
    expect(r.pmc!).toBeLessThanOrEqual(r.opp!);
    expect(r.opp!).toBeLessThanOrEqual(r.pme!);
    expect(r.pmc!).toBeLessThanOrEqual(r.ipp!);
    expect(r.ipp!).toBeLessThanOrEqual(r.pme!);
    expect(r.warnings.join(" ")).not.toMatch(/invertido/);
  });

  it("las curvas son monótonas y van de 0 a 1", () => {
    const r = analyzeVanWestendorp([vw(5, 10, 20, 30), vw(10, 15, 25, 40), vw(8, 12, 22, 35)]);
    const c = r.curves;
    for (let i = 1; i < c.length; i++) {
      expect(c[i]!.tooCheap).toBeLessThanOrEqual(c[i - 1]!.tooCheap);
      expect(c[i]!.notCheap).toBeGreaterThanOrEqual(c[i - 1]!.notCheap);
      expect(c[i]!.notExpensive).toBeLessThanOrEqual(c[i - 1]!.notExpensive);
      expect(c[i]!.tooExpensive).toBeGreaterThanOrEqual(c[i - 1]!.tooExpensive);
    }
    expect(c[0]!.tooCheap).toBe(1);
    expect(c.at(-1)!.tooExpensive).toBe(1);
  });

  it("sin respuestas válidas no hay resultado", () => {
    const r = analyzeVanWestendorp([]);
    expect(r.pmc).toBeNull();
    expect(r.curves).toEqual([]);
  });
});

describe("Gabor-Granger", () => {
  const prices = [10, 20, 30];
  const mk = (yes: [number, number, number], total: number) => {
    // Respondentes monótonos: compran a los k precios más bajos.
    const out = [];
    const counts = { 0: total - yes[0], 1: yes[0] - yes[1], 2: yes[1] - yes[2], 3: yes[2] };
    for (let k = 0 as 0 | 1 | 2 | 3; k <= 3; k++) {
      for (let i = 0; i < counts[k]; i++) out.push({ buys: [k >= 1, k >= 2, k >= 3] });
    }
    return out;
  };

  it("calcula demanda, ingreso y precio óptimo", () => {
    const r = analyzeGaborGranger(prices, mk([80, 50, 20], 100));
    expect(r.n).toBe(100);
    expect(r.points.map((p) => p.share)).toEqual([0.8, 0.5, 0.2]);
    expect(r.points.map((p) => p.revenue)).toEqual([8, 10, 6]);
    expect(r.optimalPrice).toBe(20);
  });

  it("con costo unitario optimiza la utilidad", () => {
    const r = analyzeGaborGranger(prices, mk([80, 50, 20], 100), 15);
    // utilidad: (10−15)·.8 = −4 · (20−15)·.5 = 2.5 · (30−15)·.2 = 3
    expect(r.points.map((p) => p.profit)).toEqual([-4, 2.5, 3]);
    expect(r.optimalPrice).toBe(30);
  });

  it("los intervalos de Wilson contienen la proporción y están en [0, 1]", () => {
    const r = analyzeGaborGranger(prices, mk([80, 50, 20], 100));
    for (const p of r.points) {
      expect(p.ci95[0]).toBeLessThanOrEqual(p.share);
      expect(p.ci95[1]).toBeGreaterThanOrEqual(p.share);
      expect(p.ci95[0]).toBeGreaterThanOrEqual(0);
      expect(p.ci95[1]).toBeLessThanOrEqual(1);
    }
    // Wilson para 50/100: [0.404, 0.596]
    expect(r.points[1]!.ci95[0]).toBeCloseTo(0.4038, 3);
    expect(r.points[1]!.ci95[1]).toBeCloseTo(0.5962, 3);
  });

  it("detecta y excluye respuestas no monótonas", () => {
    expect(isMonotoneGg(prices, [true, true, false])).toBe(true);
    expect(isMonotoneGg(prices, [false, true, false])).toBe(false);
    const r = analyzeGaborGranger(prices, [...mk([2, 1, 0], 2), { buys: [false, true, false] }]);
    expect(r.nInconsistent).toBe(1);
    expect(r.n).toBe(2);
  });

  it("acepta precios en cualquier orden", () => {
    const r = analyzeGaborGranger([30, 10, 20], [{ buys: [false, true, true] }, { buys: [false, true, false] }]);
    expect(r.points.map((p) => p.price)).toEqual([10, 20, 30]);
    expect(r.points.map((p) => p.share)).toEqual([1, 0.5, 0]);
  });

  it("advierte siempre que la intención sobreestima la compra", () => {
    expect(analyzeGaborGranger(prices, mk([80, 50, 20], 100)).warnings.join(" ")).toMatch(/sobreestima/);
  });

  it("sin respuestas válidas no hay precio óptimo", () => {
    expect(analyzeGaborGranger(prices, []).optimalPrice).toBeNull();
  });
});
