import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "./config";
import { mulberry32 } from "./engine/rng";
import {
  buildTrialRows,
  counterbalanceSchema,
  newCounterbalance,
  planForDimension,
  plannedTrialCount,
  scoreSession,
  submittedTrialSchema,
  toResultRow,
  trialBatchSchema,
  type CounterbalanceEntry,
  type StoredTrial,
  type SubmittedTrial,
} from "./session";

function config(protocol: IatConfig["protocol"] = "classic7", nDims = 2): IatConfig {
  const dim = (id: string) => ({
    id,
    name: id,
    positiveLabel: `Pos ${id}`,
    negativeLabel: `Neg ${id}`,
    positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"].map((w) => `${w} ${id}`),
    negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"].map((w) => `${w} ${id}`),
  });
  return {
    ...defaultIatConfig(),
    product: "café",
    protocol,
    conceptA: { label: "Marca A", stimuli: ["Marca A"] },
    conceptB: { label: "Marca B", stimuli: ["Marca B"] },
    dimensions: Array.from({ length: nDims }, (_, i) => dim(`d${i}`)),
    texts: { consent: defaultConsentText("café"), thankYou: "Gracias" },
  };
}

/** Respuestas de un participante que asocia A con el polo positivo (siempre acierta salvo `errorEvery`). */
function respond(
  cfg: IatConfig,
  cb: CounterbalanceEntry[],
  opts: { baseMs?: number; effectMs?: number; errorEvery?: number } = {},
): { dimensionIdx: number; batch: SubmittedTrial[] }[] {
  const { baseMs = 700, effectMs = 220, errorEvery = 0 } = opts;
  const rng = mulberry32(99);
  return cfg.dimensions.map((_, dimensionIdx) => {
    const plan = planForDimension(cfg, dimensionIdx, cb[dimensionIdx]);
    const batch: SubmittedTrial[] = [];
    let n = 0;
    for (const block of plan) {
      const congruent = (cb[dimensionIdx].combo === "A_with_P1") === (block.block === 3 || block.block === 4);
      for (const t of block.trials) {
        n++;
        const wrong = errorEvery > 0 && n % errorEvery === 0;
        const penalty = block.kind === "combined" && !congruent ? effectMs : 0;
        batch.push({
          block: block.block,
          index: t.index,
          rtMs: baseMs + penalty + (rng() - 0.5) * 200,
          pressed: wrong ? (t.correctSide === "left" ? "right" : "left") : t.correctSide,
        });
      }
    }
    return { dimensionIdx, batch };
  });
}

/** Simula lo que hace el endpoint /trials: validar contra el plan y "guardar". */
function store(cfg: IatConfig, cb: CounterbalanceEntry[], sent: ReturnType<typeof respond>): StoredTrial[] {
  const out: StoredTrial[] = [];
  for (const { dimensionIdx, batch } of sent) {
    const r = buildTrialRows(planForDimension(cfg, dimensionIdx, cb[dimensionIdx]), dimensionIdx, batch);
    if (!r.ok) throw new Error(r.error);
    out.push(...r.rows);
  }
  return out;
}

describe("contrabalanceo y plan reproducible", () => {
  it("newCounterbalance produce combo+seed por dimensión y es válido para el esquema", () => {
    const cb = newCounterbalance(3, mulberry32(5));
    expect(cb).toHaveLength(3);
    expect(counterbalanceSchema.safeParse(cb).success).toBe(true);
  });

  it("el mismo seed regenera exactamente el mismo plan (cliente y servidor coinciden)", () => {
    const cfg = config();
    const entry = { combo: "A_with_P2" as const, seed: 123456789 };
    expect(planForDimension(cfg, 0, entry)).toEqual(planForDimension(cfg, 0, entry));
    expect(planForDimension(cfg, 0, entry)).not.toEqual(planForDimension(cfg, 0, { ...entry, seed: 1 }));
  });

  it("el plan clásico tiene 200 ensayos; el demo, 60", () => {
    const e = { combo: "A_with_P1" as const, seed: 1 };
    expect(plannedTrialCount(planForDimension(config("classic7"), 0, e))).toBe(200);
    expect(plannedTrialCount(planForDimension(config("demo5"), 0, e))).toBe(60);
  });
});

describe("buildTrialRows (validación contra el plan del servidor)", () => {
  const cfg = config("demo5", 1);
  const entry: CounterbalanceEntry = { combo: "A_with_P1", seed: 42 };
  const plan = planForDimension(cfg, 0, entry);

  it("toma categoría, estímulo y respuesta correcta del plan, no del cliente", () => {
    const planned = plan[0].trials[0];
    const r = buildTrialRows(plan, 0, [{ block: plan[0].block, index: 0, rtMs: 640, pressed: planned.correctSide }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]).toMatchObject({
        category: planned.category,
        stimulus: planned.text,
        correct_side: planned.correctSide,
        error: false,
        rt_ms: 640,
      });
    }
  });

  it("calcula el error en el servidor a partir de la 1.ª respuesta", () => {
    const planned = plan[0].trials[0];
    const wrong = planned.correctSide === "left" ? "right" : "left";
    const r = buildTrialRows(plan, 0, [{ block: plan[0].block, index: 0, rtMs: 900, pressed: wrong }]);
    expect(r.ok && r.rows[0].error).toBe(true);
  });

  it("rechaza ensayos inexistentes y duplicados", () => {
    expect(buildTrialRows(plan, 0, [{ block: 3, index: 9999, rtMs: 500, pressed: "left" }]).ok).toBe(false);
    expect(buildTrialRows(plan, 0, [{ block: 1, index: 0, rtMs: 500, pressed: "left" }]).ok).toBe(false); // demo no tiene bloque 1
    const dup = { block: 3, index: 0, rtMs: 500, pressed: "left" as const };
    const r = buildTrialRows(plan, 0, [dup, dup]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("duplicado");
  });
});

describe("esquemas de entrada", () => {
  it("submittedTrialSchema rechaza RT negativo, NaN, enorme y lados inválidos", () => {
    const base = { block: 3, index: 0, rtMs: 500, pressed: "left" };
    expect(submittedTrialSchema.safeParse(base).success).toBe(true);
    expect(submittedTrialSchema.safeParse({ ...base, rtMs: -1 }).success).toBe(false);
    expect(submittedTrialSchema.safeParse({ ...base, rtMs: Number.NaN }).success).toBe(false);
    expect(submittedTrialSchema.safeParse({ ...base, rtMs: 1e9 }).success).toBe(false);
    expect(submittedTrialSchema.safeParse({ ...base, pressed: "up" }).success).toBe(false);
    expect(submittedTrialSchema.safeParse({ ...base, block: 8 }).success).toBe(false);
  });

  it("trialBatchSchema limita el tamaño del lote", () => {
    const t = { block: 3, index: 0, rtMs: 500, pressed: "left" as const };
    const sessionId = "00000000-0000-4000-8000-000000000001";
    expect(trialBatchSchema.safeParse({ sessionId, dimensionIdx: 0, trials: [t] }).success).toBe(true);
    expect(trialBatchSchema.safeParse({ sessionId, dimensionIdx: 0, trials: [] }).success).toBe(false);
    expect(trialBatchSchema.safeParse({ sessionId, dimensionIdx: 0, trials: Array(401).fill(t) }).success).toBe(false);
  });
});

describe("scoreSession", () => {
  it("flujo completo: un participante que asocia A↔positivo obtiene D > 0 en ambas dimensiones", () => {
    const cfg = config("classic7", 2);
    for (const seed of [1, 2, 3, 4]) {
      const cb = newCounterbalance(2, mulberry32(seed));
      const stored = store(cfg, cb, respond(cfg, cb));
      const r = scoreSession(cfg, cb, stored);
      expect(r.complete).toBe(true);
      if (r.complete) {
        expect(r.dimensions).toHaveLength(2);
        for (const d of r.dimensions) {
          expect(d.score.d as number).toBeGreaterThan(0.35);
          expect(d.score.interpretation?.direction).toBe("A");
          expect(d.validity.valid).toBe(true);
          expect(d.nTrials).toBe(200);
        }
      }
    }
  });

  it("una sesión incompleta no se puntúa y reporta qué falta", () => {
    const cfg = config("demo5", 2);
    const cb = newCounterbalance(2, mulberry32(7));
    const sent = respond(cfg, cb);
    const stored = store(cfg, cb, [sent[0]]); // sólo la dimensión 0
    const r = scoreSession(cfg, cb, stored);
    expect(r.complete).toBe(false);
    if (!r.complete) expect(r.missing).toEqual([{ dimensionIdx: 1, expected: 60, received: 0 }]);
  });

  it("una dimensión con ensayos de menos tampoco cuenta como completa", () => {
    const cfg = config("demo5", 1);
    const cb = newCounterbalance(1, mulberry32(9));
    const stored = store(cfg, cb, respond(cfg, cb)).slice(0, 59);
    const r = scoreSession(cfg, cb, stored);
    expect(r.complete).toBe(false);
  });

  it("muchos errores producen ⚠️ datos no válidos", () => {
    const cfg = config("demo5", 1);
    const cb = newCounterbalance(1, mulberry32(11));
    const stored = store(cfg, cb, respond(cfg, cb, { errorEvery: 2 })); // 50 % de errores
    const r = scoreSession(cfg, cb, stored);
    expect(r.complete).toBe(true);
    if (r.complete) {
      expect(r.dimensions[0].validity.valid).toBe(false);
      expect(r.dimensions[0].validity.flags).toContain("high_error_rate");
    }
  });

  it("respuestas absurdamente rápidas (bots/clics al azar) quedan marcadas", () => {
    const cfg = config("demo5", 1);
    const cb = newCounterbalance(1, mulberry32(13));
    const stored = store(cfg, cb, respond(cfg, cb, { baseMs: 120, effectMs: 0 }));
    const r = scoreSession(cfg, cb, stored);
    expect(r.complete && r.dimensions[0].validity.flags).toContain("fast_responses");
  });

  it("toResultRow mapea al esquema de session_results", () => {
    const cfg = config("demo5", 1);
    const cb = newCounterbalance(1, mulberry32(15));
    const r = scoreSession(cfg, cb, store(cfg, cb, respond(cfg, cb)));
    if (!r.complete) throw new Error("debería estar completa");
    const row = toResultRow("sess", "study", r.dimensions[0]);
    expect(row).toMatchObject({ session_id: "sess", study_id: "study", dimension_idx: 0, n_trials: 60, valid: true });
    expect(row.first_combo).toBe(cb[0].combo);
    expect(typeof row.d_score).toBe("number");
    expect(row.flags).toEqual([]);
  });
});
