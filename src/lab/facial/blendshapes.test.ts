import { describe, expect, it } from "vitest";
import {
  categoriesToBlendshapeMap,
  computeFacialBaseline,
  evaluateFacialFrame,
  extractHeadPoseDeg,
  FACIAL_CODING_VERSION,
  normalizeChannel,
} from "./blendshapes";

describe("motor puro de Facial Coding (fc-blendshape-v1)", () => {
  it("convierte categorías de MediaPipe y acota valores fuera de [0, 1]", () => {
    const map = categoriesToBlendshapeMap([
      { categoryName: "mouthSmileLeft", score: 0.82 },
      { categoryName: "mouthSmileRight", score: 1.4 },
      { categoryName: "browDownLeft", score: -0.2 },
    ]);
    expect(map).toEqual({
      mouthSmileLeft: 0.82,
      mouthSmileRight: 1,
      browDownLeft: 0,
    });
  });

  it("calcula la línea base por mediana y descarta el tono morfológico en reposo", () => {
    const baseline = computeFacialBaseline([
      { browDownLeft: 0.2, browDownRight: 0.2, mouthSmileLeft: 0.05 },
      { browDownLeft: 0.22, browDownRight: 0.18, mouthSmileLeft: 0.06 },
      { browDownLeft: 0.9, browDownRight: 0.9, mouthSmileLeft: 0.04 }, // outlier aislado
    ]);
    expect(baseline.version).toBe(FACIAL_CODING_VERSION);
    expect(baseline.sampleCount).toBe(3);
    expect(baseline.channels.browDownLeft).toBeCloseTo(0.22, 4);
    expect(baseline.channels.browDownRight).toBeCloseTo(0.2, 4);

    // En reposo (igual a su base), AU04 debe ser 0
    const neutral = evaluateFacialFrame(
      { browDownLeft: 0.21, browDownRight: 0.19 },
      { baseline },
    );
    expect(neutral.au04).toBe(0);
    expect(neutral.valence).toBe(0);

    // Al fruncir de verdad por encima de su base, AU04 sube proporcionalmente
    const frown = evaluateFacialFrame(
      { browDownLeft: 0.8, browDownRight: 0.8 },
      { baseline },
    );
    expect(frown.au04).toBeGreaterThan(70);
    expect(frown.friction).toBe(frown.au04);
    expect(frown.valence).toBeLessThan(-70);
  });

  it("distingue sonrisa Duchenne genuina (AU12 + AU06), sorpresa (AU01+AU02+AU26) y parpadeo (AU45)", () => {
    const duchenne = evaluateFacialFrame({
      mouthSmileLeft: 0.9,
      mouthSmileRight: 0.9,
      cheekSquintLeft: 0.8,
      cheekSquintRight: 0.8,
    });
    expect(duchenne.au12).toBe(90);
    expect(duchenne.au06).toBe(80);
    expect(duchenne.smile).toBe(Math.round(0.65 * 90 + 0.35 * 80));
    expect(duchenne.valence).toBe(duchenne.smile);
    expect(duchenne.blink).toBe(false);

    const surprise = evaluateFacialFrame({
      browInnerUp: 0.85,
      browOuterUpLeft: 0.85,
      browOuterUpRight: 0.85,
      jawOpen: 0.9,
    });
    expect(surprise.au01).toBe(85);
    expect(surprise.au02).toBe(85);
    expect(surprise.au26).toBe(90);
    expect(surprise.surprise).toBeGreaterThanOrEqual(85);

    const blinking = evaluateFacialFrame({
      eyeBlinkLeft: 0.75,
      eyeBlinkRight: 0.8,
      eyeSquintLeft: 0.6,
      eyeSquintRight: 0.6,
    });
    expect(blinking.blink).toBe(true);
    // El parpadeo atenúa el falso positivo de AU07 (lid tightener)
    expect(blinking.au07).toBe(15);
  });

  it("valida la compuerta de pose de cabeza desde la matriz 4×4 column-major", () => {
    // Matriz identidad -> 0 grados en yaw, pitch, roll
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const frontal = extractHeadPoseDeg(identity);
    expect(frontal).toEqual({
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      poseValid: true,
    });

    // Rotación de 45 grados en Y (yaw > 35°) -> poseValid = false
    const angle = (45 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const yaw45Matrix = [
      cos, 0, sin, 0,
      0, 1, 0, 0,
      -sin, 0, cos, 0,
      0, 0, 0, 1,
    ];
    const rotated = evaluateFacialFrame(
      { mouthSmileLeft: 0.8, mouthSmileRight: 0.8 },
      { matrixData: yaw45Matrix },
    );
    expect(rotated.poseValid).toBe(false);
    expect(rotated.pose?.yawDeg).toBeCloseTo(45, 1);
  });

  it("normalizeChannel protege el denominador cuando la base supera 0.7", () => {
    expect(normalizeChannel(0.85, 0.9)).toBeCloseTo((0.85 - 0.7) / 0.3, 4);
    expect(normalizeChannel(0.4, 0.5)).toBe(0);
  });
});
