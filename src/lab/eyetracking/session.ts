import {
  axisFit,
  median,
  summarize,
  verdict,
  viewportSpan,
  type AxisFit,
  type DeviceType,
  type FrameStats,
  type Geometry,
  type SessionRecord,
  type TargetResult,
  type ViewportSpan,
} from "./metrics";
import type { CalibrationPair } from "./calibration";

/** Disposición de calibración usada: permite comparar sesiones hechas antes y después de cambiarla. */
export const CALIBRATION_LAYOUT = "v3-affine-fixations";

export type Lighting = "buena" | "media" | "mala";

export interface SessionInput {
  /** Código libre del evaluador (p. ej. «P03»). Nunca nombres ni correos. */
  participant: string;
  device: DeviceType;
  glasses: boolean;
  lighting: Lighting;
  geometry: Geometry;
  viewport: { width: number; height: number };
  environment: {
    userAgent: string;
    platform: string;
    devicePixelRatio: number;
    maxTouchPoints: number;
    orientation: string | null;
  };
  engineId: string;
  /** Tiempo desde «iniciar» hasta la primera lectura (descarga de modelos + cámara), en ms. */
  readyMs: number;
  calibration: { passes: number; clicks: number; durationMs: number; layout?: string; pairs?: CalibrationPair[] };
  validation: { results: TargetResult[]; stream: FrameStats; durationMs: number };
  createdAt: Date;
}

/** Lectura por eje y del área de prueba: ayuda a distinguir sesgo, compresión y tamaño de pantalla. */
export interface Diagnostics {
  x: AxisFit;
  y: AxisFit;
  /** Mediana del error absoluto por eje como fracción del viewport (0–1); null si no hubo medición. */
  normalizedErrorX: number | null;
  normalizedErrorY: number | null;
  span: ViewportSpan;
}

/** Formato que se descarga y que lee `scripts/aggregate-eyetracking.ts`. Es compatible con SessionRecord. */
export interface ExportedSession extends SessionRecord {
  version: 1;
  createdAt: string;
  glasses: boolean;
  lighting: Lighting;
  geometry: Geometry;
  viewport: { width: number; height: number };
  environment: SessionInput["environment"];
  engineId: string;
  readyMs: number;
  calibration: SessionInput["calibration"];
  diagnostics: Diagnostics;
  validation: {
    durationMs: number;
    targets: TargetResult[];
    stream: FrameStats;
  };
}

/** Ensambla la sesión exportable y le aplica los criterios de salida. */
export function buildSession(input: SessionInput): ExportedSession {
  const summary = summarize(input.validation.results, input.geometry);
  const measured = input.validation.results.filter((r) => r.gaze !== null);
  const quality = verdict(summary, input.validation.stream.fps, input.device);
  for (const axis of ["x", "y"] as const) {
    const targets = measured.map((r) => r.target[axis]);
    const gazes = measured.map((r) => r.gaze![axis]);
    const span = axis === "x" ? input.viewport.width : input.viewport.height;
    if (measured.length >= 3 && Math.max(...targets) - Math.min(...targets) > span * 0.3
      && Math.max(...gazes) - Math.min(...gazes) < span * 0.02) {
      quality.pass = false;
      quality.reasons.push(`La mirada quedó fija en el eje ${axis === "x" ? "horizontal" : "vertical"}. Repite la calibración.`);
    }
  }
  const absErr = (axis: "x" | "y", size: number) =>
    measured.length ? median(measured.map((r) => Math.abs(r.gaze![axis] - r.target[axis]))) / size : null;
  return {
    version: 1,
    createdAt: input.createdAt.toISOString(),
    participant: input.participant.trim() || "sin-codigo",
    device: input.device,
    glasses: input.glasses,
    lighting: input.lighting,
    geometry: input.geometry,
    viewport: input.viewport,
    environment: input.environment,
    engineId: input.engineId,
    readyMs: Math.round(input.readyMs),
    calibration: { ...input.calibration, layout: input.calibration.layout ?? CALIBRATION_LAYOUT },
    diagnostics: {
      x: axisFit(input.validation.results, "x"),
      y: axisFit(input.validation.results, "y"),
      normalizedErrorX: absErr("x", input.viewport.width),
      normalizedErrorY: absErr("y", input.viewport.height),
      span: viewportSpan(input.viewport, input.geometry),
    },
    summary,
    fps: input.validation.stream.fps,
    verdict: quality,
    validation: {
      durationMs: input.validation.durationMs,
      targets: input.validation.results,
      stream: input.validation.stream,
    },
  };
}

/** Valida lo mínimo de un JSON leído de disco antes de agregarlo (el archivo viene de testers, no es de fiar). */
export function parseExportedSession(raw: unknown): SessionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const device = r.device;
  if (device !== "laptop" && device !== "phone" && device !== "tablet") return null;
  if (typeof r.fps !== "number" || !Number.isFinite(r.fps)) return null;
  const s = r.summary as Record<string, unknown> | undefined;
  const v = r.verdict as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object" || !v || typeof v !== "object") return null;
  const deg = s.medianErrorDeg;
  if (deg !== null && (typeof deg !== "number" || !Number.isFinite(deg))) return null;
  if (typeof v.pass !== "boolean") return null;
  return {
    participant: typeof r.participant === "string" ? r.participant : "sin-codigo",
    device,
    fps: r.fps,
    summary: r.summary as SessionRecord["summary"],
    verdict: { pass: v.pass, reasons: Array.isArray(v.reasons) ? v.reasons.filter((x): x is string => typeof x === "string") : [] },
  };
}
