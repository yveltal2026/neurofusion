import { describe, expect, it } from "vitest";
import {
  aggregateVideoStudy,
  buildVideoSliceHeatmap,
  countBlinkEpisodes,
  measureVideoObservation,
  resolveVideoAoiBox,
  VIDEO_EYE_METRICS_VERSION,
} from "./metrics";
import { videoObservationSchema, type VideoAoi, type VideoObservation } from "./schema";

const baseFacial = (
  t: number,
  overrides: Partial<VideoObservation["facialSamples"][number]> = {},
): VideoObservation["facialSamples"][number] => ({
  t,
  poseValid: true,
  au01: 0,
  au02: 0,
  au04: 0,
  au06: 0,
  au07: 0,
  au09: 0,
  au10: 0,
  au12: 0,
  au14: 0,
  au15: 0,
  au24: 0,
  au26: 0,
  blink: false,
  ...overrides,
});

describe("motor espacio-temporal de video (idt-video-v1 + Gaze-Locked Affect)", () => {
  it("interpola linealmente AOIs dinámicas con keyframes y respeta su intervalo activo", () => {
    const dynamicAoi: VideoAoi = {
      id: "product-moving",
      label: "Producto en movimiento",
      startMs: 1000,
      endMs: 3000,
      box: [0.1, 0.2, 0.3, 0.4],
      keyframes: [
        { tMs: 1000, box: [0.1, 0.2, 0.3, 0.4] },
        { tMs: 3000, box: [0.5, 0.2, 0.7, 0.4] },
      ],
    };

    expect(resolveVideoAoiBox(dynamicAoi, 500)).toBeNull();
    expect(resolveVideoAoiBox(dynamicAoi, 3500)).toBeNull();

    const midBox = resolveVideoAoiBox(dynamicAoi, 2000)!;
    expect(midBox[0]).toBeCloseTo(0.3, 4);
    expect(midBox[2]).toBeCloseTo(0.5, 4);
  });

  it("atribuye la reacción facial (Gaze-Locked Affect) a la AOI fijada considerando la latencia fisiológica (+300 ms)", () => {
    const rawObservation = {
      assetId: "11111111-1111-4111-8111-111111111111",
      durationMs: 4000,
      framesTotal: 40,
      framesValid: 12,
      playbackStalls: 0,
      audioMuted: false,
      baselineFrames: 30,
      gazeSamples: [
        // Fijación 1 sobre el logo (x ~ 0.2, y ~ 0.2) entre t=1000 y t=1300
        { t: 1000, x: 0.2, y: 0.2 },
        { t: 1100, x: 0.21, y: 0.2 },
        { t: 1200, x: 0.2, y: 0.21 },
        { t: 1300, x: 0.2, y: 0.2 },
        // Fijación 2 sobre el precio (x ~ 0.8, y ~ 0.8) entre t=2500 y t=2800
        { t: 2500, x: 0.8, y: 0.8 },
        { t: 2600, x: 0.81, y: 0.8 },
        { t: 2700, x: 0.8, y: 0.79 },
        { t: 2800, x: 0.8, y: 0.8 },
      ],
      facialSamples: [
        // Sonrisa Duchenne justo al mirar el logo (incluyendo +200 ms después de terminar la fijación, en t=1500)
        baseFacial(1100, { au12: 80, au06: 60 }),
        baseFacial(1500, { au12: 90, au06: 70 }),
        // Fruncido de ceño (AU04) al mirar el precio en t=2700..3000
        baseFacial(2700, { au04: 75 }),
        baseFacial(3000, { au04: 85, blink: true }),
      ],
    };

    const parsed = videoObservationSchema.parse(rawObservation);
    const aois: VideoAoi[] = [
      {
        id: "logo",
        label: "Logo",
        startMs: 500,
        endMs: 2000,
        box: [0.1, 0.1, 0.35, 0.35],
      },
      {
        id: "price",
        label: "Precio",
        startMs: 2000,
        endMs: 3800,
        box: [0.65, 0.65, 0.95, 0.95],
      },
    ];
    const scenes = [
      { id: "intro", label: "Apertura", startMs: 0, endMs: 2000 },
      { id: "offer", label: "Oferta", startMs: 2000, endMs: 4000 },
    ];

    const measured = measureVideoObservation(
      parsed,
      { aois, scenes, binMs: 1000 },
      { width: 1920, height: 1080 },
    );

    expect(measured.fixations).toHaveLength(2);
    const logoMetrics = measured.aois[0];
    const priceMetrics = measured.aois[1];

    expect(logoMetrics.fixationCount).toBe(1);
    expect(logoMetrics.ttffMs).toBe(500); // 1000 - startMs(500)
    expect(logoMetrics.affectWhileLooking?.valence).toBeGreaterThan(60);
    expect(logoMetrics.affectWhileLooking?.friction).toBe(0);
    expect(logoMetrics.affectWhileLooking?.aus.au12).toBe(85);
    expect(logoMetrics.affectWhileLooking?.aus.au06).toBe(65);

    expect(priceMetrics.fixationCount).toBe(1);
    expect(priceMetrics.affectWhileLooking?.friction).toBe(80);
    expect(priceMetrics.affectWhileLooking?.valence).toBe(-80);
    expect(priceMetrics.affectWhileLooking?.aus.au04).toBe(80);

    expect(measured.scenes[0].meanAffect?.valence).toBeGreaterThan(60);
    expect(measured.scenes[1].meanAffect?.valence).toBe(-80);
    expect(measured.scenes[1].blinkCount).toBe(1);
  });

  it("agrega múltiples sesiones deduplicando por sessionId y genera el mapa de calor por corte temporal", () => {
    const obsA: VideoObservation = {
      assetId: "11111111-1111-4111-8111-111111111111",
      durationMs: 2000,
      framesTotal: 20,
      framesValid: 4,
      playbackStalls: 0,
      audioMuted: false,
      baselineFrames: 20,
      gazeSamples: [
        { t: 200, x: 0.25, y: 0.25 },
        { t: 300, x: 0.25, y: 0.25 },
        { t: 400, x: 0.25, y: 0.25 },
      ],
      facialSamples: [baseFacial(250, { au12: 80, au06: 60 })],
    };
    const obsB: VideoObservation = {
      ...obsA,
      gazeSamples: [
        { t: 1200, x: 0.75, y: 0.75 },
        { t: 1300, x: 0.75, y: 0.75 },
        { t: 1400, x: 0.75, y: 0.75 },
      ],
      facialSamples: [baseFacial(1250, { au04: 60 })],
    };

    const agg = aggregateVideoStudy(
      [
        { sessionId: "s-1", participant: "P1", observation: obsA },
        { sessionId: "s-1", participant: "P1-dup", observation: obsA },
        { sessionId: "s-2", participant: "P2", observation: obsB },
      ],
      {
        durationMs: 2000,
        aois: [
          {
            id: "top-left",
            label: "Arriba Izquierda",
            startMs: 0,
            endMs: 1000,
            box: [0.1, 0.1, 0.4, 0.4],
          },
        ],
        scenes: [{ id: "full", label: "Spot", startMs: 0, endMs: 2000 }],
        binMs: 1000,
      },
      { width: 1280, height: 720 },
    );

    expect(agg.methodGaze).toBe(VIDEO_EYE_METRICS_VERSION);
    expect(agg.count).toBe(2);
    expect(agg.aois[0].viewers).toBe(1);
    expect(agg.aois[0].hitRatePct).toBe(50);
    expect(agg.timeline).toHaveLength(2);
    expect(agg.timeline[0].meanValence).toBeGreaterThan(50);
    expect(agg.timeline[1].meanValence).toBe(-60);

    const heatFirstSecond = buildVideoSliceHeatmap([obsA, obsB], 0, 1000, 10, 10);
    expect(heatFirstSecond).toHaveLength(1);
    expect(heatFirstSecond[0].strength).toBe(1);
  });

  it("cuenta episodios discretos de parpadeo sin duplicar fotogramas consecutivos con ojos cerrados", () => {
    const samples = [
      baseFacial(100, { blink: false }),
      baseFacial(200, { blink: true }),
      baseFacial(300, { blink: true }),
      baseFacial(400, { blink: false }),
      baseFacial(500, { blink: true }),
    ];
    expect(countBlinkEpisodes(samples)).toBe(2);
  });
});
