import { describe, expect, it } from "vitest";
import { variantConfigSchema, variantsForConceptCount, VARIANT_IDS } from "./config";
import { defaultVariantConfig, validVariantConfig } from "./defaults";
import { buildPlan, estimateVariantMinutes, flatTrials, planHash, totalTrials, seedFromSessionId, type GnatBlock, type PrimingBlock, type ScBlock, type VariantPlan } from "./plan";
import { RT_TOLERANCE_MS, resolveResponses, scoreVariant, submissionSchema, type Submission } from "./score";

const SID = "11111111-2222-4333-8444-555555555555";

describe("configuración", () => {
  it("las configuraciones por defecto validan", () => {
    for (const v of VARIANT_IDS) expect(variantConfigSchema.safeParse(defaultVariantConfig(v)).success).toBe(true);
    expect(variantConfigSchema.safeParse(defaultVariantConfig("gnat", 2)).success).toBe(true);
    expect(variantConfigSchema.safeParse(defaultVariantConfig("priming", 2)).success).toBe(true);
  });

  it("el SC-IAT exige exactamente un concepto", () => {
    const two = defaultVariantConfig("sc_iat", 2);
    const r = variantConfigSchema.safeParse(two);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/exactamente 1 concepto/);
  });

  it("el wizard sólo ofrece la variante que corresponde al número de conceptos", () => {
    expect(variantsForConceptCount(1)).toEqual(["sc_iat", "gnat", "priming"]);
    expect(variantsForConceptCount(2)).toEqual(["gnat", "priming"]);
    expect(variantsForConceptCount(3)).toEqual([]);
    expect(variantsForConceptCount(0)).toEqual([]);
  });

  it("rechaza estímulos del concepto que sean también palabras del atributo", () => {
    const c = defaultVariantConfig("gnat");
    c.concepts[0].stimuli = ["Confiable"];
    expect(variantConfigSchema.safeParse(c).success).toBe(false);
  });

  it("rechaza polos iguales y palabras repetidas", () => {
    const c = defaultVariantConfig("priming");
    c.attribute.negativeLabel = "bueno";
    expect(variantConfigSchema.safeParse(c).success).toBe(false);
    const d = defaultVariantConfig("priming");
    d.attribute.negativeWords[0] = d.attribute.positiveWords[0];
    expect(variantConfigSchema.safeParse(d).success).toBe(false);
  });

  it("valida los rangos de los parámetros", () => {
    const c = defaultVariantConfig("gnat");
    if (c.variant === "gnat") c.params.trialsPerBlock = 41;
    expect(variantConfigSchema.safeParse(c).success).toBe(false);
  });
});

describe("plan", () => {
  it("es determinista por sesión y distinto entre sesiones", () => {
    const cfg = validVariantConfig("sc_iat");
    expect(planHash(buildPlan(cfg, SID))).toBe(planHash(buildPlan(cfg, SID)));
    expect(planHash(buildPlan(cfg, SID))).not.toBe(planHash(buildPlan(cfg, "99999999-2222-4333-8444-555555555555")));
    expect(seedFromSessionId(SID)).toBe(seedFromSessionId(SID));
  });

  it("los ensayos están numerados de 0 a n−1 sin huecos", () => {
    for (const v of VARIANT_IDS) {
      const plan = buildPlan(validVariantConfig(v), SID);
      expect(flatTrials(plan).map((f) => f.trial.seq)).toEqual(Array.from({ length: totalTrials(plan) }, (_, i) => i));
    }
  });

  describe("SC-IAT", () => {
    const cfg = validVariantConfig("sc_iat");
    const plan = buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "sc_iat" }>;

    it("tiene práctica y prueba para cada emparejamiento (24 + 72 por defecto)", () => {
      expect(plan.blocks.map((b) => [b.practice, b.trials.length])).toEqual([
        [true, 24],
        [false, 72],
        [true, 24],
        [false, 72],
      ]);
      expect(new Set(plan.blocks.map((b) => b.pairing)).size).toBe(2);
    });

    it("el concepto comparte tecla con el polo emparejado en cada bloque", () => {
      for (const b of plan.blocks as ScBlock[]) {
        const paired = b.pairing === "target_positive" ? "positive" : "negative";
        for (const t of b.trials) {
          const withShared = t.category === "target" || t.category === paired;
          expect(t.correctSide).toBe(withShared ? b.sharedSide : b.sharedSide === "left" ? "right" : "left");
        }
      }
    });

    it("reparte las categorías en tercios y evita rachas de más de 3", () => {
      for (const b of plan.blocks as ScBlock[]) {
        const count = (c: string) => b.trials.filter((t) => t.category === c).length;
        expect(count("target")).toBe(b.trials.length / 3);
        expect(count("positive")).toBe(b.trials.length / 3);
        let run = 1;
        for (let i = 1; i < b.trials.length; i++) {
          run = b.trials[i].category === b.trials[i - 1].category ? run + 1 : 1;
          expect(run).toBeLessThanOrEqual(3);
        }
      }
    });

    it("contrabalancea el orden de los emparejamientos entre sesiones", () => {
      const firsts = new Set<string>();
      for (let i = 0; i < 40; i++) firsts.add((buildPlan(cfg, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) as typeof plan).blocks[0].pairing);
      expect(firsts.size).toBe(2);
    });
  });

  describe("GNAT", () => {
    it("con un concepto tiene 2 bloques de medición, mitad señal mitad ruido, cada uno con su práctica", () => {
      const plan = buildPlan(validVariantConfig("gnat"), SID) as Extract<VariantPlan, { variant: "gnat" }>;
      const measured = plan.blocks.filter((b) => !b.practice);
      expect(measured).toHaveLength(2);
      expect(plan.blocks.filter((b) => b.practice)).toHaveLength(2);
      for (const b of measured) {
        expect(b.trials).toHaveLength(40);
        expect(b.trials.filter((t) => t.signal)).toHaveLength(20);
      }
      expect(new Set(measured.map((b) => b.pole))).toEqual(new Set(["positive", "negative"]));
    });

    it("con dos conceptos tiene 4 bloques y el ruido incluye al otro concepto", () => {
      const plan = buildPlan(validVariantConfig("gnat", 2), SID) as Extract<VariantPlan, { variant: "gnat" }>;
      const measured = plan.blocks.filter((b) => !b.practice) as GnatBlock[];
      expect(measured).toHaveLength(4);
      for (const b of measured) expect(b.trials.some((t) => t.category === "noise_concept")).toBe(true);
    });

    it("la señal es del concepto o del polo del bloque; el ruido, del polo contrario", () => {
      const cfg = validVariantConfig("gnat");
      const plan = buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "gnat" }>;
      for (const b of plan.blocks.filter((x) => !x.practice)) {
        const own = b.pole === "positive" ? cfg.attribute.positiveWords : cfg.attribute.negativeWords;
        const opp = b.pole === "positive" ? cfg.attribute.negativeWords : cfg.attribute.positiveWords;
        for (const t of b.trials) {
          if (t.category === "attribute") expect(own).toContain(t.text);
          if (t.category === "noise_attribute") expect(opp).toContain(t.text);
          if (t.category === "concept") expect(cfg.concepts[0].stimuli).toContain(t.text);
        }
      }
    });

    it("práctica en 0 omite esos bloques", () => {
      const cfg = validVariantConfig("gnat");
      if (cfg.variant === "gnat") cfg.params.practiceTrials = 0;
      expect((buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "gnat" }>).blocks.every((b) => !b.practice)).toBe(true);
    });
  });

  describe("priming", () => {
    const cfg = validVariantConfig("priming");
    const plan = buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "priming" }>;

    it("cruza cada prime (concepto y control) con cada palabra × repeticiones", () => {
      const main = plan.blocks.find((b) => !b.practice) as PrimingBlock;
      const words = cfg.attribute.positiveWords.length + cfg.attribute.negativeWords.length;
      expect(main.trials).toHaveLength(2 /* primes */ * words * 2 /* repeticiones */);
      const cell = main.trials.filter((t) => t.prime === "c0" && t.stimulusId === "p:0");
      expect(cell).toHaveLength(2);
    });

    it("la tecla correcta depende de la valencia y del lado asignado a esta sesión", () => {
      for (const t of plan.blocks.flatMap((b) => b.trials)) {
        const positiveSide = plan.positiveSide;
        expect(t.correctSide).toBe(t.targetValence === "positive" ? positiveSide : positiveSide === "left" ? "right" : "left");
      }
    });

    it("la práctica usa el prime de control, no la marca", () => {
      const practice = plan.blocks.find((b) => b.practice) as PrimingBlock;
      expect(practice.trials.every((t) => t.prime === "control")).toBe(true);
    });

    it("no repite la misma palabra dos veces seguidas", () => {
      const main = plan.blocks.find((b) => !b.practice) as PrimingBlock;
      for (let i = 1; i < main.trials.length; i++) expect(main.trials[i].stimulusId).not.toBe(main.trials[i - 1].stimulusId);
    });
  });

  it("estima la duración", () => {
    expect(estimateVariantMinutes(validVariantConfig("sc_iat"))).toBeGreaterThanOrEqual(3);
    expect(estimateVariantMinutes(validVariantConfig("priming"))).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- servidor: validación y puntuación

/** Genera respuestas de un participante simulado a partir del plan. */
function simulate(plan: VariantPlan, behave: (t: ReturnType<typeof flatTrials>[number], i: number) => { key: "left" | "right" | "go" | null; rtMs: number | null }): Submission {
  return { planHash: planHash(plan), responses: flatTrials(plan).map((f, i) => ({ seq: i, ...behave(f, i) })) };
}

describe("validación de respuestas", () => {
  const cfg = validVariantConfig("sc_iat");
  const plan = buildPlan(cfg, SID);
  const perfect = () => simulate(plan, ({ trial }) => ({ key: (trial as { correctSide: "left" | "right" }).correctSide, rtMs: 600 }));

  it("acepta una sesión completa y calcula los aciertos", () => {
    const r = resolveResponses(cfg, plan, perfect());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trials.every((t) => t.correct)).toBe(true);
  });

  it("rechaza un plan distinto", () => {
    const r = resolveResponses(cfg, plan, { ...perfect(), planHash: "00000000" });
    expect(r).toEqual({ ok: false, detail: "El plan no coincide con el del servidor" });
  });

  it("rechaza cantidad de respuestas incorrecta o fuera de orden", () => {
    const sub = perfect();
    expect(resolveResponses(cfg, plan, { ...sub, responses: sub.responses.slice(1) }).ok).toBe(false);
    const swapped = { ...sub, responses: [sub.responses[1], sub.responses[0], ...sub.responses.slice(2)] };
    expect(resolveResponses(cfg, plan, swapped).ok).toBe(false);
  });

  it("rechaza tecla sin latencia, latencia sin tecla y latencias fuera de la ventana", () => {
    const base = perfect();
    const mod = (i: number, patch: Partial<Submission["responses"][number]>): Submission => ({
      ...base,
      responses: base.responses.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
    expect(resolveResponses(cfg, plan, mod(0, { rtMs: null })).ok).toBe(false);
    expect(resolveResponses(cfg, plan, mod(0, { key: null })).ok).toBe(false);
    expect(resolveResponses(cfg, plan, mod(0, { rtMs: cfg.params.windowMs + RT_TOLERANCE_MS + 1 })).ok).toBe(false);
    expect(resolveResponses(cfg, plan, mod(0, { rtMs: cfg.params.windowMs + RT_TOLERANCE_MS })).ok).toBe(true);
  });

  it("rechaza teclas que no corresponden a la variante", () => {
    const sub = perfect();
    sub.responses[0] = { seq: 0, key: "go", rtMs: 500 };
    expect(resolveResponses(cfg, plan, sub).ok).toBe(false);
    const g = validVariantConfig("gnat");
    const gp = buildPlan(g, SID);
    const gs = simulate(gp, () => ({ key: "left", rtMs: 400 }));
    expect(resolveResponses(g, gp, gs).ok).toBe(false);
  });

  it("el esquema de envío rechaza basura", () => {
    expect(submissionSchema.safeParse({ planHash: "xyz", responses: [] }).success).toBe(false);
    expect(submissionSchema.safeParse({ planHash: "0000abcd", responses: [{ seq: 0, key: "up", rtMs: 3 }] }).success).toBe(false);
  });
});

function resolved(cfg: ReturnType<typeof validVariantConfig>, plan: VariantPlan, sub: Submission) {
  const r = resolveResponses(cfg, plan, sub);
  if (!r.ok) throw new Error(r.detail);
  return r.trials;
}

describe("puntuación del servidor", () => {
  it("SC-IAT: más rápido con el polo positivo ⇒ D positivo; sólo cuenta la prueba, no la práctica", () => {
    const cfg = validVariantConfig("sc_iat");
    const plan = buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "sc_iat" }>;
    const pairingOf = new Map(plan.blocks.map((b) => [b.id, b.pairing] as const));
    const sub = simulate(plan, ({ block, trial }, i) => ({
      key: (trial as { correctSide: "left" | "right" }).correctSide,
      // práctica absurdamente lenta para comprobar que no entra; en prueba, 600 ms con polo positivo y 800 ms con negativo (+ variación)
      rtMs: block.practice ? 1400 : (pairingOf.get(block.id) === "target_positive" ? 600 : 800) + (i % 7) * 10,
    }));
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, sub));
    expect(s.primaryUnit).toBe("d");
    expect(s.primary!).toBeGreaterThan(1.5);
    expect(s.valid).toBe(true);
    if (s.detail.kind === "sc_iat") expect(s.detail.result.nUsed).toBe(144);
  });

  it("SC-IAT: contestar siempre con la misma tecla produce advertencias, no un D confiable", () => {
    const cfg = validVariantConfig("sc_iat");
    const plan = buildPlan(cfg, SID);
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, (_, i) => ({ key: "left", rtMs: 500 + (i % 5) * 10 }))));
    expect(s.valid).toBe(false);
    expect(s.flags).toContain("high_error_rate");
  });

  it("SC-IAT: no responder (tiempo agotado) cuenta como error", () => {
    const cfg = validVariantConfig("sc_iat");
    const plan = buildPlan(cfg, SID);
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, () => ({ key: null, rtMs: null }))));
    expect(s.primary).toBeNull();
    expect(s.valid).toBe(false);
  });

  it("GNAT: contraste de d′ = d′(positivo) − d′(negativo), con la práctica fuera", () => {
    const cfg = validVariantConfig("gnat");
    const plan = buildPlan(cfg, SID) as Extract<VariantPlan, { variant: "gnat" }>;
    const poleOf = new Map(plan.blocks.map((b) => [b.id, b.pole] as const));
    // Perfecto con el polo positivo; en el negativo, una de cada cuatro señales se pierde y hay 2 falsas alarmas por cada 20 ruidos.
    let signalSeen = 0;
    let noiseSeen = 0;
    const sub = simulate(plan, ({ block, trial }) => {
      const t = trial as { signal: boolean };
      if (block.practice || poleOf.get(block.id) === "positive") return { key: t.signal ? "go" : null, rtMs: t.signal ? 450 : null };
      if (t.signal) return ++signalSeen % 4 === 0 ? { key: null, rtMs: null } : { key: "go", rtMs: 520 };
      return ++noiseSeen % 10 === 0 ? { key: "go", rtMs: 540 } : { key: null, rtMs: null };
    });
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, sub));
    expect(s.primaryUnit).toBe("d_prime");
    expect(s.primary!).toBeGreaterThan(0.5);
    if (s.detail.kind === "gnat") {
      expect(s.detail.blocks).toHaveLength(2);
      const pos = s.detail.blocks.find((b) => b.pole === "positive")!;
      expect(pos.counts).toEqual({ hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 });
    }
    expect(s.flags).toEqual([]);
  });

  it("GNAT: responder a todo o a nada marca baja discriminación", () => {
    const cfg = validVariantConfig("gnat");
    const plan = buildPlan(cfg, SID);
    const all = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, () => ({ key: "go", rtMs: 450 }))));
    expect(all.flags).toContain("low_discrimination");
    const none = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, () => ({ key: null, rtMs: null }))));
    expect(none.valid).toBe(false);
  });

  it("GNAT: respuestas anticipadas (< 200 ms) marcan respuestas rápidas", () => {
    const cfg = validVariantConfig("gnat");
    const plan = buildPlan(cfg, SID);
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, ({ trial }) => ((trial as { signal: boolean }).signal ? { key: "go", rtMs: 120 } : { key: null, rtMs: null }))));
    expect(s.flags).toContain("fast_responses");
  });

  it("GNAT con dos conceptos: la medida principal es la diferencia entre los contrastes", () => {
    const cfg = validVariantConfig("gnat", 2);
    const plan = buildPlan(cfg, SID);
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, simulate(plan, ({ trial }) => ((trial as { signal: boolean }).signal ? { key: "go", rtMs: 450 } : { key: null, rtMs: null }))));
    expect(s.detail.kind === "gnat" && s.detail.contrasts).toHaveLength(2);
    expect(s.primary).not.toBeNull();
  });

  it("priming: más rápido a palabras positivas tras la marca que tras el control ⇒ efecto positivo", () => {
    const cfg = validVariantConfig("priming");
    const plan = buildPlan(cfg, SID);
    const sub = simulate(plan, ({ block, trial }) => {
      const t = trial as { prime: string; targetValence: "positive" | "negative"; correctSide: "left" | "right" };
      let rt = 600;
      if (!block.practice && t.prime === "c0") rt += t.targetValence === "positive" ? -40 : 40;
      return { key: t.correctSide, rtMs: rt };
    });
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, sub));
    expect(s.primaryUnit).toBe("ms");
    expect(s.primary!).toBeCloseTo(80, 0);
    expect(s.valid).toBe(true);
  });

  it("priming con dos conceptos: la medida es efecto(A) − efecto(B)", () => {
    const cfg = validVariantConfig("priming", 2);
    const plan = buildPlan(cfg, SID);
    const sub = simulate(plan, ({ block, trial }) => {
      const t = trial as { prime: string; targetValence: "positive" | "negative"; correctSide: "left" | "right" };
      let rt = 600;
      if (!block.practice && t.prime === "c0") rt += t.targetValence === "positive" ? -30 : 30; // efecto A = +60
      if (!block.practice && t.prime === "c1") rt += t.targetValence === "positive" ? 10 : -10; // efecto B = −20
      return { key: t.correctSide, rtMs: rt };
    });
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, sub));
    expect(s.primary).toBeCloseTo(80, 6);
  });

  it("priming: errores constantes marcan tasa alta", () => {
    const cfg = validVariantConfig("priming");
    const plan = buildPlan(cfg, SID);
    const sub = simulate(plan, ({ trial }) => {
      const t = trial as { correctSide: "left" | "right" };
      return { key: t.correctSide === "left" ? "right" : "left", rtMs: 600 };
    });
    const s = scoreVariant(cfg, plan, resolved(cfg, plan, sub));
    expect(s.flags).toContain("high_error_rate");
  });
});
