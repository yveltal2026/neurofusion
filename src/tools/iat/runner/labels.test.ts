import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { blockSides } from "../engine/counterbalance";
import { getBlockSpecs } from "../engine/protocol";
import type { PlannedBlock } from "../engine/types";
import { blockIntro, categoryLabels, readableOn, sideLabels } from "./labels";
import { withRetry, type ApiFailure } from "./api";

const cfg: IatConfig = {
  ...defaultIatConfig(),
  product: "café",
  conceptA: { label: "Marca A", stimuli: ["Marca A"] },
  conceptB: { label: "Marca B", stimuli: ["Marca B"] },
  dimensions: [
    {
      id: "c",
      name: "Confianza",
      positiveLabel: "Confiable",
      negativeLabel: "Poco confiable",
      positiveWords: ["a", "b", "c", "d", "e"],
      negativeWords: ["f", "g", "h", "i", "j"],
    },
  ],
  texts: { consent: defaultConsentText("café"), thankYou: "Gracias" },
};

function block(n: number, combo: "A_with_P1" | "A_with_P2" = "A_with_P1"): PlannedBlock {
  const spec = getBlockSpecs("classic7").find((b) => b.block === n)!;
  const sides = blockSides(spec.block, combo);
  return { ...spec, leftCategories: sides.left, rightCategories: sides.right, trials: [] };
}

describe("labels", () => {
  const labels = categoryLabels(cfg, 0);

  it("etiquetas por categoría", () => {
    expect(labels).toEqual({ A: "Marca A", B: "Marca B", P1: "Confiable", P2: "Poco confiable" });
  });

  it("en bloques combinados el concepto va antes que el atributo", () => {
    expect(sideLabels(["P1", "A"], labels)).toEqual([
      { text: "Marca A", concept: true },
      { text: "Confiable", concept: false },
    ]);
  });

  it("instrucciones por tipo de bloque mencionan los lados correctos", () => {
    expect(blockIntro(block(1), labels, 1, 7).body).toContain("«Marca A» a la izquierda y «Marca B» a la derecha");
    expect(blockIntro(block(2), labels, 2, 7).body).toContain("«Confiable» a la izquierda y «Poco confiable» a la derecha");
    expect(blockIntro(block(3), labels, 3, 7).body).toContain("Izquierda: «Marca A o Confiable». Derecha: «Marca B o Poco confiable»");
    expect(blockIntro(block(5), labels, 5, 7).body).toContain("Los lados cambiaron");
    expect(blockIntro(block(5), labels, 5, 7).body).toContain("«Marca B» va a la izquierda");
    expect(blockIntro(block(6), labels, 6, 7).body).toContain("Izquierda: «Marca B o Confiable»");
    expect(blockIntro(block(7, "A_with_P2"), labels, 7, 7).body).toContain("Izquierda: «Marca B o Poco confiable»");
    expect(blockIntro(block(4), labels, 4, 7).title).toBe("Bloque 4 de 7");
  });

  it("readableOn elige blanco sobre oscuros y negro sobre claros", () => {
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#4f46e5")).toBe("#ffffff");
    expect(readableOn("#ffff00")).toBe("#111111");
    expect(readableOn("no-hex")).toBe("#ffffff");
  });
});

describe("withRetry", () => {
  const fail = (retryable: boolean): ApiFailure => ({ ok: false, code: "x", message: "m", retryable });

  it("reintenta fallos reintentables hasta tener éxito", async () => {
    let calls = 0;
    const r = await withRetry(
      async () => (++calls < 3 ? fail(true) : { ok: true as const }),
      { retries: 4, baseDelayMs: 1 },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("no reintenta errores no reintentables", async () => {
    let calls = 0;
    const r = await withRetry(async () => (calls++, fail(false)), { retries: 4, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("se rinde tras agotar los reintentos", async () => {
    let calls = 0;
    const r = await withRetry(async () => (calls++, fail(true)), { retries: 2, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(calls).toBe(3);
  });
});
