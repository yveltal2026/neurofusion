import { describe, expect, it } from "vitest";
import { InvalidEyeRegionError, isImageAllocationError, validateEyeRegion } from "./eye-region";

export function faceFixture() {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [i, x, y] of [[103, 0.3, 0.2], [150, 0.3, 0.8], [379, 0.7, 0.8], [332, 0.7, 0.2], [151, 0.5, 0.4], [195, 0.5, 0.48]]) points[i] = { x, y, z: 0 };
  return points;
}

describe("recorte acotado de ojos", () => {
  it("permite un recorte bien definido sin asignar imágenes", () => {
    expect(() => validateEyeRegion(640, 640, faceFixture())).not.toThrow();
  });
  it.each([0.1, 0.4, 100, NaN, Infinity])("descarta un alto negativo, vacío o fuera de rango: %s", (y) => {
    const face = faceFixture(); face[195].y = y;
    expect(() => validateEyeRegion(640, 640, face)).toThrow(InvalidEyeRegionError);
  });
  it("descarta cuadriláteros degenerados y landmarks incompletos", () => {
    const face = faceFixture(); face[103] = face[150];
    expect(() => validateEyeRegion(640, 640, face)).toThrow(InvalidEyeRegionError);
    expect(() => validateEyeRegion(640, 640, [])).toThrow(InvalidEyeRegionError);
  });
  it("distingue el error de asignación reportado de otros fallos", () => {
    expect(isImageAllocationError(new RangeError("Failed to construct 'ImageData': The requested image size exceeds the supported range."))).toBe(true);
    expect(isImageAllocationError(new Error("No se pudo cargar el modelo"))).toBe(false);
    expect(isImageAllocationError(new RangeError("Matriz singular"))).toBe(false);
  });
});
