import { describe, expect, it } from "vitest";
import { normalQuantile } from "@/lib/sample-size";
import { scoreGnat, scorePriming, scoreScIat, type ScIatTrial } from "./variants";

const sc = (pairing: ScIatTrial["pairing"], rt: number | null, error = false): ScIatTrial => ({ pairing, rtMs: rt, error });

describe("SC-IAT", () => {
  it("calcula D = (media con polo negativo − media con polo positivo) / DE agrupada", () => {
    const trials = [
      sc("target_positive", 500),
      sc("target_positive", 600),
      sc("target_positive", 700),
      sc("target_negative", 700),
      sc("target_negative", 800),
      sc("target_negative", 900),
    ];
    const r = scoreScIat(trials);
    // medias 600 y 800; DE muestral de los seis valores = √20000 = 141.42
    expect(r.meanTargetPositive).toBe(600);
    expect(r.meanTargetNegative).toBe(800);
    expect(r.pooledSd).toBeCloseTo(141.421, 3);
    expect(r.d).toBeCloseTo(1.4142, 4);
    expect(r.flags).toEqual([]);
  });

  it("D es negativo si el concepto se asocia más rápido con el polo negativo", () => {
    const trials = [
      sc("target_positive", 800),
      sc("target_positive", 900),
      sc("target_negative", 500),
      sc("target_negative", 600),
    ];
    expect(scoreScIat(trials).d!).toBeLessThan(0);
  });

  it("sustituye los errores por la media de aciertos del bloque + 600 ms", () => {
    const trials = [
      sc("target_positive", 500),
      sc("target_positive", 600),
      sc("target_positive", 900, true), // error → 550 + 600 = 1150
      sc("target_negative", 700),
      sc("target_negative", 800),
    ];
    const r = scoreScIat(trials);
    expect(r.meanTargetPositive).toBeCloseTo((500 + 600 + 1150) / 3, 6);
  });

  it("la ausencia de respuesta a tiempo cuenta como error", () => {
    const trials = [
      sc("target_positive", 500),
      sc("target_positive", 600),
      sc("target_positive", null),
      sc("target_negative", 700),
      sc("target_negative", 800),
    ];
    const r = scoreScIat(trials);
    expect(r.errorRate).toBeCloseTo(1 / 5, 6);
    expect(r.meanTargetPositive).toBeCloseTo((500 + 600 + 1150) / 3, 6);
  });

  it("descarta respuestas demasiado rápidas y marca el exceso", () => {
    const trials = [
      sc("target_positive", 200),
      sc("target_positive", 250),
      sc("target_positive", 600),
      sc("target_positive", 700),
      sc("target_negative", 800),
      sc("target_negative", 900),
    ];
    const r = scoreScIat(trials);
    expect(r.nUsed).toBe(4);
    expect(r.fastFraction).toBeCloseTo(2 / 6, 6);
    expect(r.flags).toContain("fast_responses");
  });

  it("marca tasa alta de errores", () => {
    const trials = [
      sc("target_positive", 500),
      sc("target_positive", 600, true),
      sc("target_positive", 650, true),
      sc("target_negative", 700),
      sc("target_negative", 800, true),
    ];
    expect(scoreScIat(trials).flags).toContain("high_error_rate");
  });

  it("devuelve null con datos insuficientes", () => {
    const r = scoreScIat([sc("target_positive", 500), sc("target_negative", 600)]);
    expect(r.d).toBeNull();
    expect(r.flags).toContain("insufficient_data");
  });

  it("devuelve null si no hay variación", () => {
    const trials = [sc("target_positive", 500), sc("target_positive", 500), sc("target_negative", 500), sc("target_negative", 500)];
    expect(scoreScIat(trials).d).toBeNull();
  });
});

describe("GNAT", () => {
  it("d′ sin corrección coincide con la tabla normal: 90 % / 10 % → 2.563", () => {
    const r = scoreGnat({ hits: 90, misses: 10, falseAlarms: 10, correctRejections: 90 }, "none");
    expect(r.dPrime).toBeCloseTo(2 * 1.2815516, 5);
    expect(r.criterion).toBeCloseTo(0, 10);
  });

  it("la corrección log-lineal mantiene d′ finito con rendimiento perfecto", () => {
    const r = scoreGnat({ hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 });
    expect(Number.isFinite(r.dPrime!)).toBe(true);
    expect(r.dPrime!).toBeGreaterThan(2);
  });

  it("sin corrección, el rendimiento perfecto no es calculable", () => {
    const r = scoreGnat({ hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 }, "none");
    expect(r.dPrime).toBeNull();
    expect(r.flags).toContain("insufficient_data");
  });

  it("rendimiento al azar da d′ ≈ 0", () => {
    const r = scoreGnat({ hits: 10, misses: 10, falseAlarms: 10, correctRejections: 10 });
    expect(r.dPrime!).toBeCloseTo(0, 10);
  });

  it("aplica la corrección de Hautus", () => {
    const r = scoreGnat({ hits: 18, misses: 2, falseAlarms: 3, correctRejections: 17 });
    expect(r.dPrime).toBeCloseTo(normalQuantile(18.5 / 21) - normalQuantile(3.5 / 21), 10);
    expect(r.hitRate).toBeCloseTo(0.9, 10);
  });

  it("un criterio negativo indica sesgo a responder", () => {
    const r = scoreGnat({ hits: 19, misses: 1, falseAlarms: 12, correctRejections: 8 });
    expect(r.criterion!).toBeLessThan(0);
  });

  it("sin ensayos de señal o de ruido no hay resultado", () => {
    expect(scoreGnat({ hits: 0, misses: 0, falseAlarms: 3, correctRejections: 3 }).dPrime).toBeNull();
  });
});

describe("priming afectivo", () => {
  it("efecto = media incongruente − media congruente, sólo con aciertos", () => {
    const trials = [
      ...[500, 520, 510, 510].map((rtMs) => ({ congruent: true, rtMs, error: false })),
      ...[560, 580, 570, 570].map((rtMs) => ({ congruent: false, rtMs, error: false })),
      { congruent: false, rtMs: 900, error: true },
    ];
    const r = scorePriming(trials);
    expect(r.meanCongruent).toBe(510);
    expect(r.meanIncongruent).toBe(570);
    expect(r.effectMs).toBe(60);
    expect(r.errorRate).toBeCloseTo(1 / 9, 6);
  });

  it("descarta latencias fuera de rango", () => {
    const base = [500, 510, 520, 530].map((rtMs) => ({ congruent: true, rtMs, error: false }));
    const inc = [600, 610, 620, 630].map((rtMs) => ({ congruent: false, rtMs, error: false }));
    const r = scorePriming([...base, ...inc, { congruent: true, rtMs: 5000, error: false }, { congruent: false, rtMs: 100, error: false }]);
    expect(r.nCongruent).toBe(4);
    expect(r.nIncongruent).toBe(4);
  });

  it("marca datos insuficientes", () => {
    const r = scorePriming([{ congruent: true, rtMs: 500, error: false }]);
    expect(r.effectMs).toBeNull();
    expect(r.flags).toContain("insufficient_data");
  });
});
