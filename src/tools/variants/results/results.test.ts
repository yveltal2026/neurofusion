import { describe, expect, it } from "vitest";
import { validVariantConfig } from "../defaults";
import { alwaysLeft, recordFor, scBehaviour } from "../test-utils";
import { computeVariantAggregates, histogram } from "./aggregate";
import { variantCsv } from "./csv";
import { joinVariantRecords, type VariantResultRow, type VariantSessionRow } from "./load";

const sc = validVariantConfig("sc_iat");

describe("agregados", () => {
  it("promedia sólo a los participantes sin advertencias y cuenta a los demás", () => {
    const records = [
      recordFor(sc, scBehaviour(600, 800)),
      recordFor(sc, scBehaviour(620, 790)),
      recordFor(sc, scBehaviour(640, 820)),
      recordFor(sc, alwaysLeft), // muchos errores
      recordFor(sc, scBehaviour(600, 800), { excluded: true, excludedReason: "distraído" }),
    ];
    const a = computeVariantAggregates(sc, records);
    expect(a).toMatchObject({ nCompleted: 5, nManuallyExcluded: 1, nFlagged: 1, nIncluded: 3, unit: "d" });
    expect(a.flagCounts).toEqual([{ flag: "high_error_rate", count: 1 }]);
    expect(a.primary.n).toBe(3);
    expect(a.primary.mean!).toBeGreaterThan(1);
    expect(a.primary.test).not.toBeNull();
  });

  it("la sensibilidad incluye a los marcados con valor calculado pero no a los excluidos a mano", () => {
    const records = [recordFor(sc, scBehaviour(600, 800)), recordFor(sc, scBehaviour(610, 810)), recordFor(sc, alwaysLeft), recordFor(sc, scBehaviour(600, 800), { excluded: true })];
    const a = computeVariantAggregates(sc, records);
    expect(a.primary.n).toBe(2);
    expect(a.primaryAll.n).toBeLessThanOrEqual(3);
    expect(a.primaryAll.n).toBeGreaterThanOrEqual(2);
  });

  it("sin participantes o con uno solo no calcula intervalo", () => {
    expect(computeVariantAggregates(sc, []).primary).toMatchObject({ n: 0, mean: null, test: null });
    const one = computeVariantAggregates(sc, [recordFor(sc, scBehaviour(600, 800))]);
    expect(one.primary.n).toBe(1);
    expect(one.primary.test).toBeNull();
  });

  it("GNAT con dos conceptos: estimaciones por concepto y d′ por celda", () => {
    const g = validVariantConfig("gnat", 2);
    const perfect = recordFor(g, ({ trial }) => ((trial as { signal: boolean }).signal ? { key: "go", rtMs: 450 } : { key: null, rtMs: null }));
    const a = computeVariantAggregates(g, [perfect, perfect]);
    expect(a.unit).toBe("d_prime");
    expect(a.secondary).toHaveLength(2);
    expect(a.descriptive.filter((d) => d.label.startsWith("d′ medio"))).toHaveLength(4);
  });

  it("priming con dos conceptos: efecto por concepto frente al control", () => {
    const p = validVariantConfig("priming", 2);
    const rec = (shift: number) =>
      recordFor(p, ({ block, trial }) => {
        const t = trial as { prime: string; targetValence: string; correctSide: "left" | "right" };
        const rt = 600 + (!block.practice && t.prime === "c0" ? (t.targetValence === "positive" ? -shift : shift) : 0);
        return { key: t.correctSide, rtMs: rt };
      });
    const a = computeVariantAggregates(p, [rec(30), rec(40), rec(35)]);
    expect(a.unit).toBe("ms");
    expect(a.secondary[0].mean!).toBeCloseTo(70, 0);
    expect(a.secondary[1].mean!).toBeCloseTo(0, 6);
    expect(a.primary.mean!).toBeCloseTo(70, 0);
  });

  it("histograma con clases de ancho fijo que cubren todos los valores", () => {
    const bins = histogram([-0.1, 0.1, 0.3, 0.3], "d");
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(4);
    expect(bins[0].from).toBe(-0.25);
    expect(bins.find((b) => b.from === 0.25)?.count).toBe(2);
    expect(histogram([], "d")).toEqual([]);
  });
});

describe("unión de sesiones y resultados", () => {
  const session = (id: string, over: Partial<VariantSessionRow> = {}): VariantSessionRow => ({
    id,
    participant_ref: id,
    status: "completed",
    excluded: false,
    excluded_reason: null,
    device_type: "desktop",
    started_at: "2026-10-15T10:00:00Z",
    completed_at: "2026-10-15T10:05:00Z",
    ...over,
  });
  const rec = recordFor(sc, scBehaviour(600, 800));
  const result = (id: string): VariantResultRow => ({ session_id: id, scores: rec.scores, primary_value: rec.primary, valid: rec.valid, flags: rec.flags });

  it("sólo cuentan las sesiones completadas con resultado", () => {
    const out = joinVariantRecords(
      [session("a"), session("b", { status: "abandoned" }), session("c"), session("d", { started_at: "2026-10-15T11:00:00Z" })],
      [result("a"), result("b"), result("d")],
    );
    expect(out.map((r) => r.id)).toEqual(["d", "a"]); // más reciente primero; b abandonada; c sin resultado
  });

  it("descarta resultados con puntuación ilegible", () => {
    expect(joinVariantRecords([session("a")], [{ ...result("a"), scores: { raro: 1 } }])).toEqual([]);
  });
});

describe("CSV", () => {
  it("una fila por participante con banderas, exclusión y medida principal", () => {
    const csv = variantCsv(sc, [recordFor(sc, scBehaviour(600, 800)), recordFor(sc, alwaysLeft, { excluded: true, excludedReason: "=cmd" })]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    const header = lines[0].split(",");
    expect(header).toEqual(expect.arrayContaining(["participant_ref", "primary", "valid", "flags", "excluded", "mean_rt_target_positive_ms", "error_rate"]));
    const second = lines[2].split(",");
    expect(second[header.indexOf("valid")]).toBe("0");
    expect(second[header.indexOf("flags")]).toContain("high_error_rate");
    expect(second[header.indexOf("excluded")]).toBe("1");
    expect(second[header.indexOf("excluded_reason")]).toBe("'=cmd"); // neutraliza fórmulas
  });

  it("GNAT: columnas por concepto y polo; priming: por prime", () => {
    const g = validVariantConfig("gnat", 2);
    const gr = recordFor(g, ({ trial }) => ((trial as { signal: boolean }).signal ? { key: "go", rtMs: 450 } : { key: null, rtMs: null }));
    const gh = variantCsv(g, [gr]).replace("﻿", "").split("\r\n")[0].split(",");
    expect(gh).toEqual(expect.arrayContaining(["c1_positive_dprime", "c2_negative_hits", "c1_contrast", "pooled_dprime"]));

    const p = validVariantConfig("priming");
    const pr = recordFor(p, ({ trial }) => ({ key: (trial as { correctSide: "left" | "right" }).correctSide, rtMs: 600 }));
    const ph = variantCsv(p, [pr]).replace("﻿", "").split("\r\n")[0].split(",");
    expect(ph).toEqual(expect.arrayContaining(["control_bias_ms", "c0_bias_ms", "c1_effect_ms"]));
  });
});
