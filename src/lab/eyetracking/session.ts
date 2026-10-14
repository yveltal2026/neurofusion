import {
  summarize,
  verdict,
  type DeviceType,
  type FrameStats,
  type Geometry,
  type SessionRecord,
  type TargetResult,
} from "./metrics";

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
  calibration: { passes: number; clicks: number; durationMs: number };
  validation: { results: TargetResult[]; stream: FrameStats; durationMs: number };
  createdAt: Date;
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
  validation: {
    durationMs: number;
    targets: TargetResult[];
    stream: FrameStats;
  };
}

/** Ensambla la sesión exportable y le aplica los criterios de salida. */
export function buildSession(input: SessionInput): ExportedSession {
  const summary = summarize(input.validation.results, input.geometry);
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
    calibration: input.calibration,
    summary,
    fps: input.validation.stream.fps,
    verdict: verdict(summary, input.validation.stream.fps, input.device),
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
