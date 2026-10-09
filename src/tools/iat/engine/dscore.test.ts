import { describe, expect, it } from "vitest";
import { computeDScore, interpretD, MAX_RT_MS } from "./dscore";
import { assessValidity } from "./validity";
import { tQuantile, tTwoSidedP } from "./math";
import { plan, simulateParticipant } from "./fixtures";
import type { TrialRecord } from "./types";

const trial = (block: number, rtMs: number, error = false): TrialRecord => ({ block, rtMs, error });

describe("computeDScore", () => {
  it("coincide con un cálculo hecho a mano", () => {
    // 3+4: [600, 800] (M=700). 6+7: [900, 1100] (M=1000).
    // Todos: 600, 800, 900, 1100 → M=850, var muestral = 130000/3.
    const trials = [trial(3, 600), trial(4, 800), trial(6, 900), trial(7, 1100)];
    const r = computeDScore(trials, "A_with_P1");
    const expected = 300 / Math.sqrt(130000 / 3);
    expect(r.rawD).toBeCloseTo(expected, 10);
    expect(r.d).toBeCloseTo(1.44115, 4);
    expect(r.meanFirst).toBe(700);
    expect(r.meanSecond).toBe(1000);
  });

  it("normaliza el signo según la combinación inicial", () => {
    const trials = [trial(3, 600), trial(4, 800), trial(6, 900), trial(7, 1100)];
    const a = computeDScore(trials, "A_with_P1");
    const b = computeDScore(trials, "A_with_P2");
    expect(a.rawD).toBe(b.rawD);
    expect(b.d).toBeCloseTo(-(a.d as number), 10);
  });

  it("ignora los bloques que no cuentan (1, 2, 5)", () => {
    const base = [trial(3, 600), trial(4, 800), trial(6, 900), trial(7, 1100)];
    const noisy = [...base, trial(1, 100), trial(2, 9000), trial(5, 5000)];
    expect(computeDScore(noisy, "A_with_P1").d).toBe(computeDScore(base, "A_with_P1").d);
  });

  it("excluye ensayos con RT > 10 000 ms", () => {
    const base = [trial(3, 600), trial(4, 800), trial(6, 900), trial(7, 1100)];
    const withSlow = [...base, trial(4, MAX_RT_MS + 1), trial(7, 60_000)];
    const r = computeDScore(withSlow, "A_with_P1");
    expect(r.nExcludedSlow).toBe(2);
    expect(r.nUsed).toBe(4);
    expect(r.d).toBeCloseTo(computeDScore(base, "A_with_P1").d as number, 10);
  });

  it("incluye un RT de exactamente 10 000 ms", () => {
    const r = computeDScore(
      [trial(3, 600), trial(4, MAX_RT_MS), trial(6, 900), trial(7, 1100)],
      "A_with_P1",
    );
    expect(r.nUsed).toBe(4);
  });

  it("marca calidad insuficiente si > 10 % de ensayos válidos son < 300 ms", () => {
    const ok = Array.from({ length: 18 }, (_, i) => trial(i % 2 ? 4 : 7, 700 + i * 10));
    const fast = [trial(3, 200), trial(6, 250)];
    expect(computeDScore([...ok, ...fast], "A_with_P1").qualityInsufficient).toBe(false); // 2/20 = 10 % (no excede)
    const r = computeDScore([...ok, ...fast, trial(3, 100)], "A_with_P1"); // 3/21 > 10 %
    expect(r.qualityInsufficient).toBe(true);
  });

  it("devuelve null si falta un conjunto de bloques", () => {
    expect(computeDScore([trial(3, 600), trial(4, 800)], "A_with_P1").d).toBeNull();
    expect(computeDScore([], "A_with_P1").d).toBeNull();
  });

  it("devuelve null si no hay variación (SD = 0)", () => {
    expect(computeDScore([trial(3, 500), trial(6, 500)], "A_with_P1").d).toBeNull();
  });

  it("los ensayos con error cuentan con su RT (sin penalización extra)", () => {
    const withErr = [trial(3, 600, true), trial(4, 800), trial(6, 900), trial(7, 1100, true)];
    const noErr = [trial(3, 600), trial(4, 800), trial(6, 900), trial(7, 1100)];
    expect(computeDScore(withErr, "A_with_P1").d).toBe(computeDScore(noErr, "A_with_P1").d);
  });
});

describe("participante simulado (asocia A con el polo positivo)", () => {
  it.each(["A_with_P1", "A_with_P2"] as const)(
    "D > 0 sin importar el orden aleatorio (%s)",
    (combo) => {
      const blocks = plan("classic7", combo, 21);
      const trials = simulateParticipant(blocks, combo, { effectMs: 200 });
      const r = computeDScore(trials, combo);
      expect(r.d).not.toBeNull();
      expect(r.d as number).toBeGreaterThan(0.35);
      expect(r.interpretation?.direction).toBe("A");
      // El signo crudo sí depende del orden: positivo sólo si A_with_P1 va primero.
      expect(Math.sign(r.rawD as number)).toBe(combo === "A_with_P1" ? 1 : -1);
    },
  );

  it("D ≈ 0 si no hay efecto", () => {
    const combo = "A_with_P1";
    const trials = simulateParticipant(plan("classic7", combo, 8), combo, { effectMs: 0 });
    expect(Math.abs(computeDScore(trials, combo).d as number)).toBeLessThan(0.15);
  });

  it("sigue siendo válido con RT 'táctiles' más lentos y ruidosos", () => {
    const combo = "A_with_P2";
    const trials = simulateParticipant(plan("classic7", combo, 2), combo, {
      baseMs: 1100,
      effectMs: 260,
      errorRate: 0.1,
    });
    const r = computeDScore(trials, combo);
    expect(r.d as number).toBeGreaterThan(0.3);
    expect(assessValidity(trials, r).valid).toBe(true);
  });
});

describe("interpretD", () => {
  it.each([
    [0, "none", "none"],
    [0.1499, "none", "none"],
    [0.15, "slight", "A"],
    [-0.35, "slight", "B"],
    [0.36, "moderate", "A"],
    [-0.65, "moderate", "B"],
    [0.66, "strong", "A"],
    [-1.2, "strong", "B"],
  ])("D=%s → %s (%s)", (d, strength, direction) => {
    expect(interpretD(d)).toEqual({ strength, direction });
  });
});

describe("assessValidity", () => {
  const goodTrials = (n: number): TrialRecord[] =>
    Array.from({ length: n }, (_, i) => trial(i < n / 2 ? 3 : 6, 700 + (i % 7) * 40));

  it("✓ válido con datos normales", () => {
    const trials = goodTrials(40);
    const v = assessValidity(trials, computeDScore(trials, "A_with_P1"));
    expect(v.valid).toBe(true);
    expect(v.flags).toEqual([]);
  });

  it("advierte con tasa de error > 30 %", () => {
    const trials = goodTrials(40).map((t, i) => ({ ...t, error: i < 13 })); // 32.5 %
    const v = assessValidity(trials, computeDScore(trials, "A_with_P1"));
    expect(v.errorRate).toBeCloseTo(0.325);
    expect(v.flags).toContain("high_error_rate");
    expect(v.valid).toBe(false);
  });

  it("no advierte con tasa de error de exactamente 30 %", () => {
    const trials = goodTrials(40).map((t, i) => ({ ...t, error: i < 12 }));
    expect(assessValidity(trials, computeDScore(trials, "A_with_P1")).flags).not.toContain(
      "high_error_rate",
    );
  });

  it("advierte con respuestas demasiado rápidas", () => {
    const trials = goodTrials(40).map((t, i) => (i % 3 === 0 ? { ...t, rtMs: 150 } : t));
    const v = assessValidity(trials, computeDScore(trials, "A_with_P1"));
    expect(v.flags).toContain("fast_responses");
    expect(v.valid).toBe(false);
  });

  it("advierte si no se pudo calcular D", () => {
    const v = assessValidity([], computeDScore([], "A_with_P1"));
    expect(v.flags).toContain("insufficient_data");
    expect(v.valid).toBe(false);
  });

  it("la tasa de error considera todos los bloques, no sólo los de D", () => {
    const trials = [trial(1, 600, true), trial(1, 600, true), trial(3, 600), trial(6, 900), trial(4, 700), trial(7, 800)];
    expect(assessValidity(trials, computeDScore(trials, "A_with_P1")).errorRate).toBeCloseTo(2 / 6);
  });
});

describe("distribución t", () => {
  it("cuantiles críticos conocidos (dos colas, 95 %)", () => {
    expect(tQuantile(0.975, 5)).toBeCloseTo(2.5706, 3);
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.2281, 3);
    expect(tQuantile(0.975, 30)).toBeCloseTo(2.0423, 3);
  });
  it("p-valor de dos colas en el valor crítico = 0.05", () => {
    expect(tTwoSidedP(2.2281, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 10)).toBeCloseTo(1, 10);
  });
});

describe("scoreDimension", () => {
  it("combina D-score y validez", async () => {
    const { scoreDimension } = await import("./score");
    const combo = "A_with_P1";
    const trials = simulateParticipant(plan("classic7", combo, 5), combo);
    const r = scoreDimension(trials, combo);
    expect(r.score.d).not.toBeNull();
    expect(r.validity.valid).toBe(true);
    expect(r.validity.nTrials).toBe(200);
  });
});
