import { describe, expect, it } from "vitest";
import { buildReviewUserText, elementsToAois, mergeMissingElements, PIECE_SYSTEM_PROMPT, pieceAiSchema, REVIEW_SYSTEM_PROMPT, reviewSchema, type PieceElement } from "../analysis/piece";
import { attentionField, blindZones, coldZones, gazePath, heatColor, outsidePath, type Aoi } from "./aoi";
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

  describe("orden de coordenadas de la IA (box2d = [ymin, xmin, ymax, xmax])", () => {
    const base = { summary: "s", message: "m", firstSeconds: "f", criteria: Object.fromEntries(["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map((k) => [k, { score: 3, evidence: "e" }])), issues: [], strengths: [], limitations: [] };
    const parse = (elements: object[]) => pieceAiSchema.parse({ ...base, elements });
    const el = (extra: object) => ({ id: "E1", label: "x", kind: "product", tile: 0, attention: 4, importance: 5, order: 1, ...extra });

    it("el frasco de la pieza de Taster's Choice (caso real: Gemini respondió [y, x, y, x])", () => {
      // Frasco: x 63–90 % y y 17–82 % de la imagen. Gemini lo dijo como [ymin, xmin, ymax, xmax].
      const aois = elementsToAois(parse([el({ box2d: [168, 626, 825, 902] })]), planTiles(687, 685));
      const [x0, y0, x1, y1] = aois[0].box;
      expect([x0, y0, x1, y1].map((v) => Math.round(v * 1000))).toEqual([626, 168, 902, 825]);
      // La caja queda del lado derecho y alta, no abajo-centro como con la lectura transpuesta.
      expect((x0 + x1) / 2).toBeGreaterThan(0.7);
      expect((y0 + y1) / 2).toBeLessThan(0.55);
    });

    it("un elemento en la parte baja tiene y altas; uno a la derecha, x altas", () => {
      const abajo = elementsToAois(parse([el({ box2d: [800, 100, 950, 300] })]), planTiles(1000, 1000))[0].box;
      expect(abajo).toEqual([0.1, 0.8, 0.3, 0.95]);
      const derecha = elementsToAois(parse([el({ box2d: [100, 700, 300, 950] })]), planTiles(1000, 1000))[0].box;
      expect(derecha).toEqual([0.7, 0.1, 0.95, 0.3]);
    });

    it("el mapa de calor se centra en el elemento (no en su transposición)", () => {
      const aois = elementsToAois(parse([el({ box2d: [168, 626, 825, 902] })]), planTiles(687, 685));
      const gw = 100, gh = 100;
      const field = attentionField(aois, gw, gh);
      let best = 0, bx = 0, by = 0;
      field.forEach((v, i) => {
        if (v > best) { best = v; bx = i % gw; by = Math.floor(i / gw); }
      });
      expect(bx / gw).toBeGreaterThan(0.6); // derecha
      expect(by / gh).toBeLessThan(0.6); // zona alta/media, no la mesa de abajo
    });

    it("los análisis guardados con `box` ([x0, y0, x1, y1]) se leen igual que antes", () => {
      const legacy = elementsToAois(parse([el({ box: [500, 800, 900, 900] })]), planTiles(1080, 1080));
      expect(legacy[0].box).toEqual([0.5, 0.8, 0.9, 0.9]);
    });

    it("box2d tiene prioridad y un elemento sin ninguna caja se rechaza", () => {
      const both = elementsToAois(parse([el({ box2d: [100, 200, 300, 400], box: [0, 0, 1000, 1000] })]), planTiles(1000, 1000));
      expect(both[0].box).toEqual([0.2, 0.1, 0.4, 0.3]);
      expect(() => parse([el({})])).toThrow(/box2d/);
    });
  });
});


describe("zonas frías y recorrido", () => {
  const a = (id: string, attention: number, importance: number, order: number | null): Aoi => ({ id, label: id, kind: "other", box: [0.1, 0.1, 0.3, 0.3], attention, importance, order });

  it("coldZones: ciega (importancia 4–5) y baja atención (3), las más importantes primero; descarta lo decorativo", () => {
    const list = [a("deco", 0.2, 1, null), a("media", 0.2, 3, 2), a("clave", 0.2, 5, null), a("visto", 0.8, 5, 1), a("limite", 0.4, 4, 3), a("sobre", 0.45, 5, 4)];
    expect(coldZones(list).map((z) => [z.aoi.id, z.level])).toEqual([
      ["clave", "blind"],
      ["limite", "blind"],
      ["media", "low"],
    ]);
    // blindZones conserva su definición (sólo importancia 4–5)
    expect(blindZones(list).map((x) => x.id)).toEqual(["clave", "limite"]);
  });

  it("outsidePath: importantes sin lugar en el recorrido", () => {
    const list = [a("deco", 0.2, 1, null), a("media", 0.2, 3, null), a("clave", 0.5, 5, null), a("en-ruta", 0.9, 5, 1)];
    expect(outsidePath(list).map((x) => x.id)).toEqual(["clave", "media"]);
  });
});

describe("cobertura de la lectura de la IA", () => {
  const base = { summary: "s", message: "m", firstSeconds: "f", criteria: Object.fromEntries(["clarity", "hierarchy", "cta", "legibility", "brand", "load"].map((k) => [k, { score: 3, evidence: "e" }])), issues: [], strengths: [], limitations: [] };
  const el = (id: string, box2d: [number, number, number, number], extra: Partial<PieceElement> = {}): PieceElement => ({ id, label: id, kind: "text", tile: 0, box2d, attention: 2, importance: 4, order: null, ...extra });
  const result = (elements: PieceElement[]) => pieceAiSchema.parse({ ...base, elements });

  it("el prompt exige cobertura, atención por saliencia y orden para todo lo visible", () => {
    expect(PIECE_SYSTEM_PROMPT).toMatch(/COBERTURA/);
    expect(PIECE_SYSTEM_PROMPT).toMatch(/CADA medio de contacto/);
    expect(PIECE_SYSTEM_PROMPT).toMatch(/NO qué tan importante es/);
    expect(PIECE_SYSTEM_PROMPT).toMatch(/usa null sólo para elementos decorativos/);
    expect(PIECE_SYSTEM_PROMPT).toMatch(/\[ymin, xmin, ymax, xmax\]/);
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/FALTAN/);
  });

  it("el mensaje de revisión lista lo ya identificado con su caja [ymin, xmin, ymax, xmax]", () => {
    const text = buildReviewUserText([el("E1", [100, 200, 300, 400], { label: "Logo", kind: "logo" })], { objective: "Generar solicitudes", brand: "Respalda Más", tiles: 1 });
    expect(text).toContain("Generar solicitudes");
    expect(text).toContain("E1 | Logo | logo | tile 0 | box2d [100, 200, 300, 400]");
    expect(text).toContain("Devuelve únicamente los elementos que faltan");
  });

  it("reviewSchema acepta una lista vacía y rechaza elementos sin caja", () => {
    expect(reviewSchema.parse({ missing: [] }).missing).toEqual([]);
    expect(() => reviewSchema.parse({ missing: [{ id: "E90", label: "x", kind: "text", attention: 1, importance: 3, order: null }] })).toThrow();
  });

  it("mergeMissingElements: agrega lo que falta con ids nuevos y lo manda al final del recorrido", () => {
    const first = result([el("E1", [0, 0, 200, 1000], { order: 1 }), el("E2", [500, 0, 700, 500], { order: 2 })]);
    const merged = mergeMissingElements(first, [
      el("E90", [900, 600, 960, 950], { label: "Correo", kind: "cta", order: 1 }),
      el("E91", [820, 50, 880, 400], { label: "Seguro y confiable", kind: "badge", order: null }),
    ]);
    expect(merged.elements.map((e) => [e.id, e.label, e.order])).toEqual([
      ["E1", "E1", 1],
      ["E2", "E2", 2],
      ["E3", "Correo", 3],
      ["E4", "Seguro y confiable", null],
    ]);
    // El resultado sigue siendo válido y se convierte en AOIs de la imagen completa.
    expect(pieceAiSchema.safeParse(merged).success).toBe(true);
    const aois = elementsToAois(merged, planTiles(1000, 1000));
    expect(aois.find((x) => x.label === "Correo")?.box).toEqual([0.6, 0.9, 0.95, 0.96]);
  });

  it("mergeMissingElements: descarta los que ya existen (traslape) y respeta el máximo", () => {
    const first = result([el("E1", [100, 100, 300, 500])]);
    const dup = mergeMissingElements(first, [el("E90", [110, 110, 300, 500], { label: "Duplicado" })]);
    expect(dup).toBe(first);
    const many = result(Array.from({ length: 25 }, (_, i) => el(`E${i + 1}`, [i * 30, 0, i * 30 + 20, 100])));
    expect(mergeMissingElements(many, [el("E90", [900, 800, 990, 990])]).elements).toHaveLength(25);
  });

  it("mergeMissingElements: elementos de otra franja no se consideran duplicados", () => {
    const first = result([el("E1", [100, 100, 300, 500])]);
    const merged = mergeMissingElements(first, [el("E90", [100, 100, 300, 500], { tile: 1 })]);
    expect(merged.elements).toHaveLength(2);
  });
});
