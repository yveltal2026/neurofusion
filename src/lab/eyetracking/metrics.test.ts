import { describe, expect, it } from "vitest";
import {
  LIBRARY_CALIBRATION_WINDOW,
  THRESHOLDS,
  aggregateSessions,
  axisFit,
  calibrationGrid,
  cmToDeg,
  distance,
  evaluateTarget,
  frameStats,
  median,
  percentile,
  pxToCm,
  pxToDeg,
  summarize,
  validationTargets,
  verdict,
  viewportSpan,
  type GazeFrame,
  type Geometry,
  type SessionRecord,
  type TargetResult,
} from "./metrics";

const geo: Geometry = { screenWidthPx: 1440, screenWidthCm: 30.4, distanceCm: 50 };

function frames(points: Array<[number, number | null, number | null]>): GazeFrame[] {
  return points.map(([t, x, y]) => ({ t, x, y, inferenceMs: null }));
}

describe("estadísticos básicos", () => {
  it("mediana de pares e impares y de vacío", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("percentil interpola linealmente", () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });

  it("distancia euclidiana", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("conversiones físicas", () => {
  it("px → cm usa la escala ancho físico / ancho en px", () => {
    expect(pxToCm(1440, geo)).toBeCloseTo(30.4);
    expect(pxToCm(0, geo)).toBe(0);
  });

  it("cm → grados: 1 cm a 57.3 cm ≈ 1°", () => {
    expect(cmToDeg(1, 57.2958)).toBeCloseTo(1, 2);
    expect(cmToDeg(0, 50)).toBe(0);
  });

  it("px → grados compone ambas conversiones", () => {
    // 2.32 cm a 50 cm ≈ 2.66°
    const px = 2.32 / (30.4 / 1440);
    expect(pxToDeg(px, geo)).toBeCloseTo(2.657, 2);
  });
});

describe("cuadrículas", () => {
  it("calibración: 9 puntos dentro del viewport y a >5 % entre consecutivos", () => {
    const w = 1000;
    const h = 800;
    const pts = calibrationGrid(w, h);
    expect(pts).toHaveLength(9);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0.1 * w - 1e-9);
      expect(p.x).toBeLessThanOrEqual(0.9 * w + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0.1 * h - 1e-9);
      expect(p.y).toBeLessThanOrEqual(0.9 * h + 1e-9);
    }
    // La librería ignora clics a menos de 0.05 (normalizado) del anterior, por eje.
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i].x - pts[i - 1].x) / w;
      const dy = Math.abs(pts[i].y - pts[i - 1].y) / h;
      expect(dx >= 0.05 || dy >= 0.05).toBe(true);
    }
  });

  it("calibración: los últimos puntos (los que conserva la librería) cubren las 4 esquinas y el centro", () => {
    const w = 1000;
    const h = 800;
    const tail = calibrationGrid(w, h).slice(-LIBRARY_CALIBRATION_WINDOW);
    const has = (fx: number, fy: number) => tail.some((p) => Math.abs(p.x - fx * w) < 1e-9 && Math.abs(p.y - fy * h) < 1e-9);
    for (const [fx, fy] of [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.1, 0.9],
      [0.9, 0.9],
      [0.5, 0.5],
    ]) {
      expect(has(fx, fy)).toBe(true);
    }
  });

  it("calibración: repetir el recorrido (2 pasadas) no deja dos puntos seguidos demasiado cerca", () => {
    const w = 1000;
    const h = 800;
    const grid = calibrationGrid(w, h);
    const twice = [...grid, ...grid];
    for (let i = 1; i < twice.length; i++) {
      const dx = Math.abs(twice[i].x - twice[i - 1].x) / w;
      const dy = Math.abs(twice[i].y - twice[i - 1].y) / h;
      expect(dx >= 0.05 || dy >= 0.05).toBe(true);
    }
  });

  it("validación: 8 puntos distintos y ninguno coincide con calibración", () => {
    const calib = calibrationGrid(1000, 800);
    const val = validationTargets(1000, 800);
    expect(val).toHaveLength(8);
    for (const v of val) {
      expect(calib.some((c) => distance(c, v) < 1)).toBe(false);
    }
    expect(new Set(val.map((v) => `${v.x},${v.y}`)).size).toBe(8);
  });
});

describe("evaluateTarget", () => {
  const target = { x: 500, y: 400 };

  it("mediana robusta a un valor atípico y error contra el objetivo", () => {
    const f = frames([
      [1000, 510, 400],
      [1010, 510, 400],
      [1020, 510, 400],
      [1030, 510, 400],
      [1040, 9999, 9999], // atípico
      [1050, 510, 400],
    ]);
    const r = evaluateTarget(target, f, 1000, 2000);
    expect(r.samples).toBe(6);
    expect(r.gaze).toEqual({ x: 510, y: 400 });
    expect(r.errorPx).toBeCloseTo(10);
  });

  it("ignora lecturas fuera de la ventana, nulas y no finitas", () => {
    const f = frames([
      [900, 500, 400], // antes
      [2000, 500, 400], // el límite superior es exclusivo
      [1100, null, null],
      [1200, NaN, 400],
      [1300, 500, 400],
    ]);
    const r = evaluateTarget(target, f, 1000, 2000, 1);
    expect(r.samples).toBe(1);
  });

  it("sin lecturas suficientes devuelve null en vez de un error engañoso", () => {
    const r = evaluateTarget(target, frames([[1000, 500, 400]]), 0, 2000);
    expect(r.gaze).toBeNull();
    expect(r.errorPx).toBeNull();
    expect(r.samples).toBe(1);
  });

  it("precisión: 0 con lecturas idénticas, crece con la dispersión", () => {
    const quiet = evaluateTarget(
      target,
      frames([0, 1, 2, 3, 4, 5].map((i) => [i, 500, 400] as [number, number, number])),
      0,
      10,
    );
    expect(quiet.precisionPx).toBe(0);
    const noisy = evaluateTarget(
      target,
      frames([0, 1, 2, 3, 4, 5].map((i) => [i, 500 + (i % 2 ? 30 : 0), 400] as [number, number, number])),
      0,
      10,
    );
    expect(noisy.precisionPx).toBeCloseTo(30);
  });
});

describe("frameStats", () => {
  it("calcula lecturas/s, fracción válida y mediana de inferencia", () => {
    const f: GazeFrame[] = [
      { t: 0, x: 1, y: 1, inferenceMs: 10 },
      { t: 250, x: null, y: null, inferenceMs: 30 },
      { t: 500, x: 1, y: 1, inferenceMs: 20 },
      { t: 750, x: 1, y: 1, inferenceMs: null },
      { t: 5000, x: 1, y: 1, inferenceMs: 1 }, // fuera
    ];
    const s = frameStats(f, 0, 1000);
    expect(s.frames).toBe(4);
    expect(s.fps).toBe(4);
    expect(s.validRatio).toBe(0.75);
    expect(s.inferenceMsMedian).toBe(20);
  });

  it("ventana vacía o de duración cero no divide entre cero", () => {
    expect(frameStats([], 0, 1000)).toEqual({ fps: 0, validRatio: 0, inferenceMsMedian: null, frames: 0 });
    expect(frameStats([], 5, 5).fps).toBe(0);
  });
});

describe("summarize y verdict", () => {
  const ok = (errorPx: number) => ({
    target: { x: 0, y: 0 },
    samples: 20,
    gaze: { x: 0, y: 0 },
    errorPx,
    precisionPx: 5,
  });
  const missing = { target: { x: 0, y: 0 }, samples: 0, gaze: null, errorPx: null, precisionPx: null };

  it("resume con mediana, media, p75, máximo y cobertura", () => {
    const s = summarize([ok(10), ok(20), ok(30), ok(100), missing], geo);
    expect(s.targets).toBe(5);
    expect(s.measured).toBe(4);
    expect(s.coverage).toBe(0.8);
    expect(s.medianErrorPx).toBe(25);
    expect(s.meanErrorPx).toBe(40);
    expect(s.maxErrorPx).toBe(100);
    expect(s.p75ErrorPx).toBeCloseTo(47.5);
    expect(s.medianErrorDeg).toBeCloseTo(pxToDeg(25, geo));
    expect(s.medianPrecisionPx).toBe(5);
  });

  it("sin objetivos medidos todo es null y el veredicto falla", () => {
    const s = summarize([missing, missing], geo);
    expect(s.medianErrorPx).toBeNull();
    expect(s.medianErrorDeg).toBeNull();
    const v = verdict(s, 30, "laptop");
    expect(v.pass).toBe(false);
    expect(v.reasons.join(" ")).toContain("ningún objetivo");
  });

  it("aplica el umbral por dispositivo y el mínimo de fps", () => {
    // ≈ 5° en un laptop a 50 cm: falla en laptop (4°) pero pasa en celular (6°)
    const px = (Math.tan((5 * Math.PI) / 180) * geo.distanceCm) / (geo.screenWidthCm / geo.screenWidthPx);
    const s = summarize([ok(px), ok(px), ok(px), ok(px)], geo);
    expect(verdict(s, 30, "laptop").pass).toBe(false);
    expect(verdict(s, 30, "phone").pass).toBe(true);
    expect(verdict(s, 30, "tablet").pass).toBe(true);
    const slow = verdict(s, THRESHOLDS.minFps - 1, "phone");
    expect(slow.pass).toBe(false);
    expect(slow.reasons).toHaveLength(1);
  });

  it("cobertura menor a 75 % invalida aunque el error sea bueno", () => {
    const s = summarize([ok(1), ok(1), missing, missing], geo);
    const v = verdict(s, 30, "laptop");
    expect(v.pass).toBe(false);
    expect(v.reasons[0]).toContain("50 %");
  });
});

describe("aggregateSessions", () => {
  const session = (device: SessionRecord["device"], deg: number, fps: number, pass: boolean): SessionRecord => ({
    participant: "p",
    device,
    fps,
    verdict: { pass, reasons: [] },
    summary: {
      targets: 8,
      measured: 8,
      coverage: 1,
      medianErrorPx: 1,
      meanErrorPx: 1,
      p75ErrorPx: 1,
      maxErrorPx: 1,
      medianErrorCm: 1,
      medianErrorDeg: deg,
      p75ErrorDeg: deg,
      medianPrecisionPx: 1,
    },
  });

  it("agrupa por dispositivo y omite los que no tienen sesiones", () => {
    const agg = aggregateSessions([
      session("laptop", 2, 30, true),
      session("laptop", 4, 20, true),
      session("laptop", 9, 10, false),
      session("phone", 5, 25, true),
    ]);
    expect(agg.map((a) => a.device)).toEqual(["laptop", "phone"]);
    const laptop = agg[0];
    expect(laptop.sessions).toBe(3);
    expect(laptop.passed).toBe(2);
    expect(laptop.medianOfMedianDeg).toBe(4);
    expect(laptop.worstMedianDeg).toBe(9);
    expect(laptop.medianFps).toBe(20);
  });

  it("sin sesiones devuelve lista vacía", () => {
    expect(aggregateSessions([])).toEqual([]);
  });
});

describe("axisFit", () => {
  const r = (tx: number, gx: number | null): TargetResult => ({
    target: { x: tx, y: 0 },
    samples: gx === null ? 0 : 20,
    gaze: gx === null ? null : { x: gx, y: 0 },
    errorPx: gx === null ? null : Math.abs(gx - tx),
    precisionPx: gx === null ? null : 1,
  });

  it("recupera ganancia y ordenada de una relación lineal exacta", () => {
    const fit = axisFit([r(0, 50), r(100, 150), r(200, 250), r(300, 350)], "x");
    expect(fit.gain).toBeCloseTo(1);
    expect(fit.offsetPx).toBeCloseTo(50);
    expect(fit.r2).toBeCloseTo(1);
    expect(fit.biasPx).toBeCloseTo(50);
  });

  it("detecta compresión: la mirada se mueve la mitad que el objetivo", () => {
    const fit = axisFit([r(0, 0), r(100, 50), r(200, 100), r(300, 150)], "x");
    expect(fit.gain).toBeCloseTo(0.5);
    expect(fit.biasPx).toBeCloseTo(-75);
  });

  it("ignora objetivos sin lectura y exige 3 medidos y varianza en el objetivo", () => {
    expect(axisFit([r(0, 0), r(100, 100), r(200, null)], "x")).toEqual({ gain: null, offsetPx: null, r2: null, biasPx: null });
    expect(axisFit([r(5, 1), r(5, 2), r(5, 3)], "x").gain).toBeNull();
    expect(axisFit([r(0, 0), r(100, 100), r(200, 200), r(300, null)], "x").gain).toBeCloseTo(1);
  });

  it("mirada constante: ganancia 0 y R² 0, sin dividir entre cero", () => {
    const fit = axisFit([r(0, 77), r(100, 77), r(200, 77)], "x");
    expect(fit.gain).toBeCloseTo(0);
    expect(fit.r2).toBe(0);
  });
});

describe("viewportSpan", () => {
  it("tamaño físico y semiángulos: monitor ultrawide de 80 cm a 50 cm", () => {
    const g: Geometry = { screenWidthPx: 2560, screenWidthCm: 80, distanceCm: 50 };
    const s = viewportSpan({ width: 2519, height: 914 }, g);
    expect(s.widthCm).toBeCloseTo(78.7, 1);
    expect(s.heightCm).toBeCloseTo(28.6, 1);
    expect(s.halfAngleXDeg).toBeCloseTo(38.2, 0);
    expect(s.halfAngleYDeg).toBeCloseTo(15.9, 0);
  });

  it("laptop de 31 cm a 50 cm abarca ±17° en horizontal", () => {
    const g: Geometry = { screenWidthPx: 1440, screenWidthCm: 31, distanceCm: 50 };
    expect(viewportSpan({ width: 1440, height: 800 }, g).halfAngleXDeg).toBeCloseTo(17.2, 0);
  });
});
