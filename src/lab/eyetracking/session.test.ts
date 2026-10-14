import { describe, expect, it } from "vitest";
import { buildSession, parseExportedSession, type SessionInput } from "./session";
import type { TargetResult } from "./metrics";

const target = (errorPx: number | null): TargetResult => ({
  target: { x: 100, y: 100 },
  samples: errorPx === null ? 0 : 30,
  gaze: errorPx === null ? null : { x: 100 + errorPx, y: 100 },
  errorPx,
  precisionPx: errorPx === null ? null : 4,
});

function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    participant: "  P01 ",
    device: "laptop",
    glasses: false,
    lighting: "buena",
    geometry: { screenWidthPx: 1440, screenWidthCm: 30.4, distanceCm: 50 },
    viewport: { width: 1440, height: 800 },
    environment: { userAgent: "UA", platform: "Linux", devicePixelRatio: 2, maxTouchPoints: 0, orientation: null },
    engineId: "webeyetrack@0.0.2",
    readyMs: 4321.7,
    calibration: { passes: 1, clicks: 9, durationMs: 20_000 },
    validation: {
      results: Array.from({ length: 8 }, () => target(50)),
      stream: { fps: 24, validRatio: 0.95, inferenceMsMedian: 18, frames: 480 },
      durationMs: 20_000,
    },
    createdAt: new Date("2026-10-14T12:00:00Z"),
    ...overrides,
  };
}

describe("buildSession", () => {
  it("calcula resumen y veredicto, normaliza el código y redondea readyMs", () => {
    const s = buildSession(input());
    expect(s.version).toBe(1);
    expect(s.participant).toBe("P01");
    expect(s.readyMs).toBe(4322);
    expect(s.createdAt).toBe("2026-10-14T12:00:00.000Z");
    expect(s.summary.medianErrorPx).toBe(50);
    expect(s.summary.coverage).toBe(1);
    expect(s.fps).toBe(24);
    // 50 px ≈ 1.06 cm a 50 cm ≈ 1.2°
    expect(s.summary.medianErrorDeg).toBeGreaterThan(1);
    expect(s.summary.medianErrorDeg).toBeLessThan(1.5);
    expect(s.verdict.pass).toBe(true);
  });

  it("un código vacío cae a «sin-codigo» y una cobertura baja no pasa", () => {
    const s = buildSession(
      input({
        participant: "   ",
        validation: {
          results: [target(50), target(null), target(null), target(null)],
          stream: { fps: 30, validRatio: 1, inferenceMsMedian: null, frames: 1 },
          durationMs: 1,
        },
      }),
    );
    expect(s.participant).toBe("sin-codigo");
    expect(s.verdict.pass).toBe(false);
  });
});

describe("parseExportedSession", () => {
  it("acepta una sesión exportada tal cual", () => {
    const exported = JSON.parse(JSON.stringify(buildSession(input())));
    const parsed = parseExportedSession(exported);
    expect(parsed).not.toBeNull();
    expect(parsed?.device).toBe("laptop");
    expect(parsed?.verdict.pass).toBe(true);
  });

  it("acepta error mediano null (sesión sin objetivos medidos)", () => {
    const exported = JSON.parse(
      JSON.stringify(
        buildSession(
          input({
            validation: {
              results: [target(null)],
              stream: { fps: 30, validRatio: 0, inferenceMsMedian: null, frames: 0 },
              durationMs: 1,
            },
          }),
        ),
      ),
    );
    expect(parseExportedSession(exported)?.summary.medianErrorDeg).toBeNull();
  });

  it.each([
    ["no objeto", 5],
    ["null", null],
    ["dispositivo inválido", { device: "tv", fps: 1, summary: {}, verdict: { pass: true } }],
    ["fps no numérico", { device: "laptop", fps: "30", summary: {}, verdict: { pass: true } }],
    ["sin resumen", { device: "laptop", fps: 30, verdict: { pass: true } }],
    ["grados no numéricos", { device: "laptop", fps: 30, summary: { medianErrorDeg: "2" }, verdict: { pass: true } }],
    ["veredicto sin pass", { device: "laptop", fps: 30, summary: { medianErrorDeg: 2 }, verdict: {} }],
  ])("rechaza %s", (_name, raw) => {
    expect(parseExportedSession(raw)).toBeNull();
  });
});
