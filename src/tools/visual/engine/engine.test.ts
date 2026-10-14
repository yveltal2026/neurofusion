import { describe, expect, it } from "vitest";
import { elementsToAois, pieceAiSchema } from "../analysis/piece";
import { attentionField, blindZones, gazePath, heatColor, type Aoi } from "./aoi";
import { computeMetrics, contrastRatio, estimateTextContrast, type RawImage } from "./metrics";
import { checkPlacement, getPlacement } from "./placements";
import { planTiles, tileBoxToImage } from "./tiles";

function solid(w: number, h: number, rgb: [number, number, number]): RawImage {
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set(rgb, i * 3);
  return { width: w, height: h, channels: 3, data };
}

describe("métricas de imagen", () => {
  it("una imagen plana: sin contraste, sin bordes, todo espacio negativo, sin color", () => {
    const m = computeMetrics(solid(64, 64, [128, 128, 128]));
    expect(m.rmsContrast).toBe(0);
    expect(m.edgeDensity).toBe(0);
    expect(m.negativeSpace).toBe(1);
    expect(m.colorfulness).toBe(0);
    expect(m.palette[0].share).toBe(1);
  });

  it("un tablero blanco/negro tiene contraste alto y muchos bordes", () => {
    const img = solid(64, 64, [0, 0, 0]);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((Math.floor(x / 3) + Math.floor(y / 3)) % 2) img.data.set([255, 255, 255], (y * 64 + x) * 3);
    const m = computeMetrics(img);
    expect(m.rmsContrast).toBeGreaterThan(0.45);
    expect(m.edgeDensity).toBeGreaterThan(0.3);
    expect(m.negativeSpace).toBe(0);
  });

  it("contraste WCAG: negro sobre blanco = 21:1 y estimación por caja", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
    const img = solid(40, 20, [255, 255, 255]);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 35; x++) if (x % 3 === 0) img.data.set([0, 0, 0], (y * 40 + x) * 3);
    expect(estimateTextContrast(img, [0.1, 0.25, 0.9, 0.75])).toBeCloseTo(21, 0);
    expect(estimateTextContrast(img, [0, 0, 0.01, 0.01])).toBeNull();
  });
});

describe("formatos", () => {
  it("revisa tamaño exacto y peso de display; proporción y resolución de Meta", () => {
    const display = getPlacement("display_300x250")!;
    expect(checkPlacement(display, { width: 300, height: 250, bytes: 120_000 }).every((c) => c.ok)).toBe(true);
    expect(checkPlacement(display, { width: 600, height: 500, bytes: 400_000 }).filter((c) => !c.ok)).toHaveLength(2);
    const meta = getPlacement("meta_feed_vertical")!;
    const c = checkPlacement(meta, { width: 1080, height: 1080, bytes: 1_000 });
    expect(c.find((x) => x.label === "Proporción")?.ok).toBe(false);
  });
});

const aoi = (id: string, box: Aoi["box"], attention: number, importance: number, order: number | null): Aoi => ({ id, label: id, kind: "other", box, attention, importance, order });

describe("AOIs y renders", () => {
  const list = [aoi("A", [0.1, 0.1, 0.3, 0.3], 1, 5, 1), aoi("B", [0.6, 0.6, 0.9, 0.9], 0.2, 5, null), aoi("C", [0.6, 0.1, 0.8, 0.2], 0.6, 2, 2)];

  it("zonas ciegas = importantes con atracción baja; recorrido ordenado", () => {
    expect(blindZones(list).map((a) => a.id)).toEqual(["B"]);
    expect(gazePath(list).map((a) => a.id)).toEqual(["A", "C"]);
  });

  it("el campo de atención alcanza 1 en la AOI más atractiva y es ~0 lejos de todo", () => {
    const f = attentionField(list, 100, 100);
    const at = (x: number, y: number) => f[Math.round(y * 100) * 100 + Math.round(x * 100)];
    expect(Math.max(...f)).toBeCloseTo(1, 5);
    expect(at(0.2, 0.2)).toBeGreaterThan(0.9);
    expect(at(0.2, 0.2)).toBeGreaterThan(at(0.75, 0.75));
    expect(at(0.05, 0.95)).toBeLessThan(0.05);
  });

  it("debajo del umbral el color es transparente (no tiñe toda la imagen)", () => {
    expect(heatColor(0.05)[3]).toBe(0);
    expect(heatColor(1)[3]).toBeGreaterThan(150);
  });
});

describe("franjas para la IA", () => {
  it("una pieza cuadrada va en una sola imagen", () => {
    expect(planTiles(1080, 1080).tiles).toHaveLength(1);
  });

  it("una página larga se corta en franjas y las cajas se traducen a la imagen completa", () => {
    const plan = planTiles(1366, 8000);
    expect(plan.tiles.length).toBe(4);
    expect(plan.coverage).toBeLessThan(1);
    const box = tileBoxToImage(plan, 1, [0, 0, 1000, 1000]);
    expect(box[0]).toBe(0);
    expect(box[2]).toBe(1);
    expect(box[1]).toBeCloseTo(plan.tiles[1].top / plan.scaledHeight, 5);
    expect(box[3]).toBeCloseTo((plan.tiles[1].top + plan.tiles[1].height) / plan.scaledHeight, 5);
  });

  it("convierte los elementos de la IA en AOIs normalizadas", () => {
    const result = pieceAiSchema.parse({
      summary: "s",
      message: "m",
      firstSeconds: "f",
      elements: [
        { id: "E1", label: "CTA", kind: "cta", tile: 0, box: [500, 800, 900, 900], attention: 4, importance: 5, order: 2 },
        { id: "E2", label: "Diminuto", kind: "other", tile: 0, box: [10, 10, 11, 11], attention: 1, importance: 1, order: null },
      ],
      criteria: Object.fromEntries(["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map((k) => [k, { score: 3, evidence: "e" }])),
      issues: [],
      strengths: [],
      limitations: [],
    });
    const aois = elementsToAois(result, planTiles(1080, 1080));
    expect(aois).toHaveLength(1);
    expect(aois[0]).toMatchObject({ id: "E1", kind: "cta", attention: 0.8, importance: 5, order: 2 });
    expect(aois[0].box).toEqual([0.5, 0.8, 0.9, 0.9]);
  });
});
