import { describe, expect, it } from "vitest";
import { applyCalibration, assessFixation, fitCalibration, fixationWindowMs, fixationMedian, fixationWeight, moveSaturatedTarget, refineCalibration, refinementGrid, stableFixation, weakCalibrationPoints, type CalibrationFit, type FixationQuality } from "./calibration";
import { calibrationGrid, validationTargets } from "./metrics";
import { screenWidthCm } from "./screen";

describe("calibración controlada", () => {
  it("corrige sesgo, escala y mezcla de ejes en objetivos independientes", () => {
    const raw = (x: number, y: number) => ({ x: 0.2 + 0.3 * x + 0.05 * y, y: 0.1 - 0.03 * x + 0.4 * y });
    const fit = fitCalibration(calibrationGrid(1, 1).map((target) => ({ target, gaze: raw(target.x, target.y) })));
    const point = applyCalibration(fit, raw(0.3, 0.7));
    expect(point.x).toBeCloseTo(0.3, 2);
    expect(point.y).toBeCloseTo(0.7, 2);
    expect(applyCalibration(fit, raw(1.5, 0.7)).x).toBeGreaterThan(1);
  });

  it("rechaza el bloqueo en la esquina observado en el JSON recibido", () => {
    expect(() => fitCalibration(calibrationGrid(1, 1).map((target) => ({ target, gaze: { x: 1, y: 0 } })))).toThrow("quedó fija");
    expect(() => fitCalibration(calibrationGrid(1, 1).map((target) => ({ target, gaze: { x: target.x, y: target.x } })))).toThrow("ambos ejes");
  });

  it("usa medianas y exige suficientes lecturas", () => {
    expect(fixationMedian([{ x: 1, y: 2 }])).toBeNull();
    expect(fixationMedian([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }, { x: 99, y: 99 }])).toEqual({ x: 1, y: 2 });
  });
});

describe("ponderación y revisión selectiva", () => {
  const noisy: FixationQuality = { samples: 20, durationMs: 800, validRatio: 0.8,
    dispersion: { x: 0.04, y: 0.04 }, drift: { x: 0.025, y: 0.025 } };

  it("reduce la influencia de un punto ruidoso sobre objetivos independientes", () => {
    const pairs = calibrationGrid(1, 1).map((target, i) => ({ target,
      gaze: i === 4 ? { x: target.x + 0.2, y: target.y + 0.1 } : target,
      quality: i === 4 ? noisy : undefined }));
    const weighted = fitCalibration(pairs);
    const uniform = fitCalibration(pairs.map((p) => ({ ...p, quality: undefined })));
    const error = (fit: CalibrationFit) => validationTargets(1, 1).reduce((n, t) => {
      const p = applyCalibration(fit, t);
      return n + Math.hypot(p.x - t.x, p.y - t.y);
    }, 0);
    expect(error(weighted)).toBeLessThan(error(uniform) * 0.5);
    expect(fixationWeight(pairs[4])).toBeGreaterThanOrEqual(0.1);
    expect(weakCalibrationPoints(pairs)).toEqual([4]);
    expect(weakCalibrationPoints(pairs.map((p) => ({ ...p, quality: noisy })))).toEqual([]);
  });

  it("acota la revisión y pondera también el ajuste fino", () => {
    const base: CalibrationFit = { center: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, x: [1, 0, 0], y: [0, 1, 0] };
    const pairs = refinementGrid(1, 1).map((target, i) => ({ target,
      gaze: i === 0 ? { x: target.x + 0.2, y: target.y + 0.1 } : target,
      quality: i === 0 ? noisy : undefined }));
    const weighted = refineCalibration(base, pairs);
    const uniform = refineCalibration(base, pairs.map((p) => ({ ...p, quality: undefined })));
    expect(Math.abs(applyCalibration(weighted, { x: 0.7, y: 0.3 }).x - 0.7))
      .toBeLessThan(Math.abs(applyCalibration(uniform, { x: 0.7, y: 0.3 }).x - 0.7));
    const weak = pairs.map((p, i) => ({ ...p, quality: i < 3 ? noisy : undefined }));
    expect(weakCalibrationPoints(weak)).toHaveLength(2);
  });

  it("detecta saturación incluso con dispersión cero y acerca sólo el eje afectado", () => {
    const frames = Array.from({ length: 33 }, (_, i) => ({ t: i * 25, x: 500, y: 600, inferenceMs: 10 }));
    const result = assessFixation(frames, 0, 800, { width: 1000, height: 600 });
    expect(result).toEqual({ ok: false, reason: "saturated", saturation: { x: 0, y: 1 } });
    expect(stableFixation(frames, 0, 800, { width: 1000, height: 600 })).toBeNull();
    expect(moveSaturatedTarget({ x: 0.1, y: 0.9 }, { x: 0, y: 1 })).toEqual({ x: 0.1, y: 0.76 });
    expect(moveSaturatedTarget({ x: 0.5, y: 0.5 }, { x: 1, y: 1 })).toBeNull();
    expect(() => fitCalibration(calibrationGrid(1, 1).map((target) => ({ target, gaze: target,
      quality: { ...noisy, saturation: { x: 0, y: 1 } } })))).toThrow("saturadas");
  });
});

describe("ajuste fino independiente", () => {
  const base: CalibrationFit = { center: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, x: [1, 0, 0], y: [0, 1, 0] };

  it("aprende escala y desplazamiento por eje y generaliza a objetivos nuevos", () => {
    const raw = (x: number, y: number) => ({ x: x * 1.19 - 0.06, y: y * 1.13 + 0.03 });
    const pairs = refinementGrid(1, 1).map((target) => ({ target, gaze: raw(target.x, target.y) }));
    const refined = refineCalibration(base, pairs);
    for (const target of validationTargets(1, 1)) {
      expect(pairs.some((p) => p.target.x === target.x && p.target.y === target.y)).toBe(false);
      const corrected = applyCalibration(refined, raw(target.x, target.y));
      expect(corrected.x).toBeCloseTo(target.x, 6);
      expect(corrected.y).toBeCloseTo(target.y, 6);
    }
    expect(base.refinement).toBeUndefined();
    expect(refined.refinement?.x.gain).toBeCloseTo(1 / 1.19);
  });

  it("rechaza ajustes con salida constante o invertida", () => {
    const pairs = refinementGrid(1, 1).map((target) => ({ target, gaze: { x: 1, y: 0 } }));
    expect(() => refineCalibration(base, pairs)).toThrow("no distingue");
    expect(() => refineCalibration(base, pairs.map((p) => ({ ...p, gaze: { x: 1 - p.target.x, y: p.target.y } })))).toThrow("no distingue");
  });
});

describe("ventanas de fijación", () => {
  const viewport = { width: 1000, height: 600 };
  const frames = Array.from({ length: 33 }, (_, i) => ({ t: i * 25, x: 500 + (i % 3), y: 300 + (i % 3), inferenceMs: 10 }));

  it("conserva muestras, dispersión y deriva de una fijación estable", () => {
    const result = stableFixation(frames, 0, 800, viewport);
    expect(result?.quality.samples).toBe(33);
    expect(result?.quality.validRatio).toBe(1);
    expect(result?.quality.durationMs).toBe(800);
    expect(result?.quality.dispersion.x).toBeLessThan(0.005);
    expect(result?.gaze.x).toBeCloseTo(0.501);
  });

  it("rechaza pérdidas de cara, ventanas cortas, lecturas antiguas, deriva y dispersión", () => {
    expect(stableFixation(frames.map((f, i) => i % 2 ? { ...f, x: null, y: null } : f), 0, 800, viewport)).toBeNull();
    expect(stableFixation(frames.slice(0, 9), 0, 200, viewport)).toBeNull();
    expect(stableFixation(frames, 0, 1200, viewport)).toBeNull();
    expect(stableFixation(frames.map((f) => ({ ...f, x: f.t / 2 })), 0, 800, viewport)).toBeNull();
    expect(stableFixation(frames.map((f, i) => ({ ...f, y: i % 2 ? 100 : 400 })), 0, 800, viewport)).toBeNull();
  });
});

describe("pantalla en pulgadas", () => {
  it("calcula el ancho a partir de diagonal y formato, también ultrawide", () => {
    expect(screenWidthCm(27, "16:9", 2560, 1440)).toBeCloseTo(59.77, 1);
    expect(screenWidthCm(34, "21:9", 3440, 1440)).toBeCloseTo(79.38, 1);
    expect(screenWidthCm(49, "32:9", 5120, 1440)).toBeCloseTo(119.81, 1);
    expect(screenWidthCm(27, "auto", 2560, 1440)).toBeCloseTo(screenWidthCm(27, "16:9", 2560, 1440));
    expect(screenWidthCm(27, "16:9", 1440, 2560)).toBeCloseTo(33.62, 1);
    expect(screenWidthCm(Infinity, "auto", 2560, 1440)).toBeNaN();
  });
});


it("reúne las mismas diez muestras a 10 FPS ampliando la ventana, sin aprobar ruido", () => {
  const frames = Array.from({ length: 15 }, (_, i) => ({ t: i * 100, x: 400, y: 300, inferenceMs: 90 }));
  const viewport = { width: 1000, height: 1000 };
  expect(assessFixation(frames, 600, 1400, viewport).ok).toBe(false);
  expect(fixationWindowMs(10)).toBe(1200);
  expect(assessFixation(frames, 1400 - fixationWindowMs(10), 1400, viewport).ok).toBe(true);
  expect(assessFixation(frames.map((f, i) => ({ ...f, x: f.x + (i % 2 ? 100 : -100) })), 200, 1400, viewport).ok).toBe(false);
  expect(fixationWindowMs(30)).toBe(800);
  expect(fixationWindowMs(0)).toBeLessThanOrEqual(2200);
});
