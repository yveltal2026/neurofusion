import { describe, expect, it } from "vitest";
import { applyCalibration, fitCalibration, fixationMedian, refineCalibration, refinementGrid, stableFixation, type CalibrationFit } from "./calibration";
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
