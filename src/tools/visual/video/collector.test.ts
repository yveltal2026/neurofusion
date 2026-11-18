import { describe, expect, it } from "vitest";
import { collectVideoObservation, computeVideoContentRect } from "./collector";
import { videoObservationSchema } from "./schema";

describe("recolector multimodal de video (collector.ts)", () => {
  it("descuenta las barras de pillarboxing y letterboxing en object-fit: contain", () => {
    // Video vertical 9:16 (1080×1920) dentro de un contenedor 16:9 (1600×900)
    const pillar = computeVideoContentRect(
      { left: 0, top: 0, width: 1600, height: 900 },
      1080,
      1920,
    );
    expect(pillar.height).toBe(900);
    expect(pillar.width).toBeCloseTo(506.25, 2);
    expect(pillar.left).toBeCloseTo((1600 - 506.25) / 2, 2);

    // Video panorámico 21:9 (2100×900) dentro de un contenedor 16:9 (1600×900)
    const letter = computeVideoContentRect(
      { left: 0, top: 0, width: 1600, height: 900 },
      2100,
      900,
    );
    expect(letter.width).toBe(1600);
    expect(letter.height).toBeCloseTo(685.71, 2);
    expect(letter.top).toBeCloseTo((900 - 685.71) / 2, 2);
  });

  it("proyecta coordenadas de mirada dentro del video y cuantiza blendshapes a 10 Hz con línea base", () => {
    const rect = computeVideoContentRect(
      { left: 100, top: 50, width: 1280, height: 720 },
      1280,
      720,
    );
    const obs = collectVideoObservation({
      assetId: "11111111-1111-4111-8111-111111111111",
      durationMs: 3000,
      baselineFrames: [
        { mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
        { mouthSmileLeft: 0.12, mouthSmileRight: 0.08 },
      ],
      rect,
      frames: [
        // Centro del video en t=120 ms con sonrisa
        {
          videoTimeMs: 120,
          x: 100 + 640,
          y: 50 + 360,
          blendshapes: { mouthSmileLeft: 0.85, mouthSmileRight: 0.85, cheekSquintLeft: 0.6, cheekSquintRight: 0.6 },
        },
        // Mismo bin de 100 ms (t=180 ms) -> se promedia en el bin t=100
        {
          videoTimeMs: 180,
          x: 100 + 640,
          y: 50 + 360,
          blendshapes: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.7, cheekSquintRight: 0.7 },
        },
        // Punto fuera del video (en barra exterior x=20) -> se filtra de gazeSamples pero cuenta en facial
        {
          videoTimeMs: 410,
          x: 20,
          y: 20,
          blendshapes: { browDownLeft: 0.7, browDownRight: 0.7, eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 },
        },
      ],
    });

    const validated = videoObservationSchema.parse(obs);
    expect(validated.baselineFrames).toBe(2);
    expect(validated.gazeSamples).toHaveLength(2);
    expect(validated.gazeSamples[0]).toEqual({ t: 120, x: 0.5, y: 0.5 });

    expect(validated.facialSamples).toHaveLength(2);
    expect(validated.facialSamples[0].t).toBe(100);
    expect(validated.facialSamples[0].au12).toBeGreaterThan(80);
    expect(validated.facialSamples[1].t).toBe(400);
    expect(validated.facialSamples[1].au04).toBe(70);
    expect(validated.facialSamples[1].blink).toBe(true);
  });
});

it("rechaza lecturas viejas o futuras sin fabricar mediciones al avanzar el reloj del video", async () => {
  const { isRecentReading } = await import("./collector");
  expect(isRecentReading(undefined, 1000)).toBe(false);
  expect(isRecentReading(700, 1000)).toBe(false);
  expect(isRecentReading(1001, 1000)).toBe(false);
  expect(isRecentReading(900, 1000)).toBe(true);
});
