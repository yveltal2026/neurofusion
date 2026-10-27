import { describe, expect, it } from "vitest";
import { applyCalibration, fitCalibration, fixationMedian } from "./calibration";
import { calibrationGrid } from "./metrics";
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
