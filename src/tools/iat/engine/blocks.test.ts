import { describe, expect, it } from "vitest";
import { sideOf } from "./counterbalance";
import { blockSides, chooseFirstCombo } from "./counterbalance";
import { mulberry32 } from "./rng";
import { estimateMinutes, getBlockSpecs, trialsPerDimension } from "./protocol";
import type { CategoryId, FirstCombo, PlannedBlock } from "./types";
import { plan } from "./fixtures";

const combos: FirstCombo[] = ["A_with_P1", "A_with_P2"];

function countBy(block: PlannedBlock, cat: CategoryId) {
  return block.trials.filter((t) => t.category === cat).length;
}

describe("protocolo", () => {
  it("clásico: 20/20/20/40/40/20/40 = 200 ensayos", () => {
    expect(getBlockSpecs("classic7").map((b) => b.trials)).toEqual([20, 20, 20, 40, 40, 20, 40]);
    expect(trialsPerDimension("classic7")).toBe(200);
  });

  it("demo: 5 bloques (3–7) con 10 ensayos por bloque combinado", () => {
    const specs = getBlockSpecs("demo5");
    expect(specs.map((b) => b.block)).toEqual([3, 4, 5, 6, 7]);
    expect(specs.filter((b) => b.kind === "combined").every((b) => b.trials === 10)).toBe(true);
  });

  it("sólo los bloques 3, 4, 6 y 7 cuentan para D", () => {
    const d = getBlockSpecs("classic7").filter((b) => b.countsForD).map((b) => b.block);
    expect(d).toEqual([3, 4, 6, 7]);
  });

  it("estima la duración crecientemente con las dimensiones", () => {
    expect(estimateMinutes("classic7", 2)).toBeGreaterThan(estimateMinutes("classic7", 1));
    expect(estimateMinutes("demo5", 1)).toBeLessThan(estimateMinutes("classic7", 1));
  });
});

describe("contrabalanceo", () => {
  it("reparte ~50/50 entre las dos combinaciones", () => {
    const rng = mulberry32(42);
    const n = 4000;
    let a1 = 0;
    for (let i = 0; i < n; i++) if (chooseFirstCombo(rng) === "A_with_P1") a1++;
    expect(a1 / n).toBeGreaterThan(0.46);
    expect(a1 / n).toBeLessThan(0.54);
  });

  it("A comparte lado con P1 en 3-4 y con P2 en 6-7 (combo A_with_P1)", () => {
    const s3 = blockSides(3, "A_with_P1");
    const s6 = blockSides(6, "A_with_P1");
    expect(sideOf("A", s3)).toBe(sideOf("P1", s3));
    expect(sideOf("A", s6)).toBe(sideOf("P2", s6));
    expect(sideOf("A", s3)).not.toBe(sideOf("A", s6));
  });

  it("A comparte lado con P2 en 3-4 y con P1 en 6-7 (combo A_with_P2)", () => {
    const s4 = blockSides(4, "A_with_P2");
    const s7 = blockSides(7, "A_with_P2");
    expect(sideOf("A", s4)).toBe(sideOf("P2", s4));
    expect(sideOf("A", s7)).toBe(sideOf("P1", s7));
  });

  it("los atributos no cambian de lado entre bloques 2, 3-4 y 6-7", () => {
    for (const combo of combos) {
      const side = (b: 2 | 3 | 4 | 6 | 7) => sideOf("P1", blockSides(b, combo));
      expect(new Set([2, 3, 4, 6, 7].map((b) => side(b as 2 | 3 | 4 | 6 | 7))).size).toBe(1);
    }
  });
});

describe("buildDimensionPlan", () => {
  it.each(combos)("clásico (%s): 200 ensayos con los conteos por bloque correctos", (combo) => {
    const blocks = plan("classic7", combo);
    expect(blocks.map((b) => b.trials.length)).toEqual([20, 20, 20, 40, 40, 20, 40]);
    expect(blocks.reduce((n, b) => n + b.trials.length, 0)).toBe(200);
  });

  it("demo: 60 ensayos en 5 bloques", () => {
    const blocks = plan("demo5", "A_with_P1");
    expect(blocks.map((b) => b.block)).toEqual([3, 4, 5, 6, 7]);
    expect(blocks.reduce((n, b) => n + b.trials.length, 0)).toBe(60);
  });

  it.each(combos)("cada ensayo tiene el lado correcto según su categoría (%s)", (combo) => {
    for (const block of plan("classic7", combo, 3)) {
      for (const t of block.trials) {
        const expected = block.leftCategories.includes(t.category) ? "left" : "right";
        expect(t.correctSide).toBe(expected);
      }
    }
  });

  it("balancea categorías: bloques de una tarea y combinados", () => {
    for (const combo of combos) {
      const blocks = plan("classic7", combo, 11);
      const byNum = Object.fromEntries(blocks.map((b) => [b.block, b]));
      // Bloque 1: 10 A / 10 B. Bloque 2: 10 P1 / 10 P2.
      expect([countBy(byNum[1], "A"), countBy(byNum[1], "B")]).toEqual([10, 10]);
      expect([countBy(byNum[2], "P1"), countBy(byNum[2], "P2")]).toEqual([10, 10]);
      // Bloque 4 (40): 10 de cada categoría.
      for (const c of ["A", "B", "P1", "P2"] as const) expect(countBy(byNum[4], c)).toBe(10);
      // Bloque 5 (40): 20 A / 20 B.
      expect([countBy(byNum[5], "A"), countBy(byNum[5], "B")]).toEqual([20, 20]);
    }
  });

  it("en bloques combinados alterna ensayos de concepto y de atributo", () => {
    const blocks = plan("classic7", "A_with_P1", 5).filter((b) => b.kind === "combined");
    for (const block of blocks) {
      const isConcept = block.trials.map((t) => t.category === "A" || t.category === "B");
      for (let i = 1; i < isConcept.length; i++) expect(isConcept[i]).not.toBe(isConcept[i - 1]);
    }
  });

  it("no repite inmediatamente un estímulo de atributo", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const block of plan("classic7", "A_with_P1", seed)) {
        for (let i = 1; i < block.trials.length; i++) {
          const prev = block.trials[i - 1];
          const cur = block.trials[i];
          if (cur.category === "P1" || cur.category === "P2") {
            expect(cur.stimulusId).not.toBe(prev.stimulusId);
          }
        }
      }
    }
  });

  it("no encadena más de 3 ensayos de la misma categoría en bloques de una tarea", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const block of plan("classic7", "A_with_P2", seed).filter((b) => b.kind !== "combined")) {
        let run = 1;
        for (let i = 1; i < block.trials.length; i++) {
          run = block.trials[i].category === block.trials[i - 1].category ? run + 1 : 1;
          expect(run).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("usa todas las palabras de cada polo", () => {
    const b4 = plan("classic7", "A_with_P1", 9).find((b) => b.block === 4)!;
    const p1 = new Set(b4.trials.filter((t) => t.category === "P1").map((t) => t.stimulusId));
    expect(p1.size).toBe(5);
  });

  it("es determinista con la misma semilla", () => {
    expect(plan("classic7", "A_with_P1", 99)).toEqual(plan("classic7", "A_with_P1", 99));
  });

  it("reparte el sobrante al azar en bloques demo (10 ensayos → 5 concepto / 5 atributo)", () => {
    for (const block of plan("demo5", "A_with_P1", 4).filter((b) => b.kind === "combined")) {
      const concept = block.trials.filter((t) => t.category === "A" || t.category === "B").length;
      expect(concept).toBe(5);
      expect(block.trials.length - concept).toBe(5);
    }
  });
});
