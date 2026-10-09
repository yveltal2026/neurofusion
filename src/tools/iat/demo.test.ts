import { describe, expect, it } from "vitest";
import { iatConfigSchema } from "./config";
import { computeStudyAggregates } from "./engine/stats";
import { demoConfig, simulateDemoPopulation, simulateDemoSession } from "./demo";

describe("demo educativo", () => {
  const config = demoConfig();

  it("la configuración demo es válida para el servidor", () => {
    const r = iatConfigSchema.safeParse(config);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("una sesión simulada tiene todos los ensayos y resultados por dimensión", () => {
    const s = simulateDemoSession(config, 0, { seed: 1 });
    expect(s.trials).toHaveLength(400); // 2 dimensiones × 200
    expect(s.results).toHaveLength(2);
    expect(s.results.map((r) => r.dimension_idx)).toEqual([0, 1]);
    expect(s.counterbalance).toHaveLength(2);
  });

  it("es determinista", () => {
    expect(simulateDemoSession(config, 3, { seed: 9 })).toEqual(simulateDemoSession(config, 3, { seed: 9 }));
    expect(simulateDemoSession(config, 3, { seed: 9 })).not.toEqual(simulateDemoSession(config, 4, { seed: 9 }));
  });

  it("los 'bots' y las sesiones descuidadas quedan marcados como no válidos; las buenas no", () => {
    const bot = simulateDemoSession(config, 0, { seed: 1, quality: "bot" });
    expect(bot.results.every((r) => !r.valid && r.flags.includes("fast_responses"))).toBe(true);
    const sloppy = simulateDemoSession(config, 0, { seed: 1, quality: "sloppy" });
    expect(sloppy.results.every((r) => r.flags.includes("high_error_rate"))).toBe(true);
    const goods = Array.from({ length: 10 }, (_, i) => simulateDemoSession(config, i, { seed: 1 }));
    expect(goods.every((g) => g.results.every((r) => r.valid))).toBe(true);
  });

  it("la población demo reproduce el efecto diseñado: A↔Confiable fuerte, Premium ~ nulo", () => {
    const pop = simulateDemoPopulation(config, 40);
    const agg = computeStudyAggregates(
      pop.map((s) => ({
        id: s.participantRef,
        deviceType: s.deviceType,
        segments: {},
        explicit: s.explicit,
        excluded: false,
        dimensions: s.results.map((r) => ({ d: r.d_score, valid: r.valid })),
      })),
      { dimensionLabels: ["Confianza", "Posicionamiento"] },
    );
    const conf = agg.dimensions[0].test!;
    expect(conf.mean).toBeGreaterThan(0.3);
    expect(conf.p).toBeLessThan(0.001);
    expect(Math.abs(agg.dimensions[1].test!.mean)).toBeLessThan(0.3);
    // Hay sesiones inválidas que el análisis omite por defecto.
    expect(agg.dimensions[0].n).toBeLessThan(40);
    expect(agg.dimensions[0].n).toBeGreaterThan(30);
    expect(agg.deviceMix.mobile + agg.deviceMix.tablet).toBeGreaterThan(0);
  });
});
