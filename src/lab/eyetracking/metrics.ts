/**
 * Métricas del spike de eye tracking (código puro, sin I/O ni DOM).
 *
 * Todas las posiciones están en píxeles CSS del viewport. Para pasar a centímetros y a grados se
 * necesita el ancho físico de la pantalla y la distancia de los ojos, que declara el evaluador:
 * son una aproximación (el viewport puede ser menor que la pantalla y la distancia varía), así que
 * los grados son un orden de magnitud, no una medición de laboratorio.
 */

export interface Point {
  x: number;
  y: number;
}

/** Una lectura de mirada. `x`/`y` son null cuando el parpadeo o la pérdida de cara la invalidan. */
export interface GazeFrame {
  /** performance.now() al recibirla en el hilo principal (no el timestamp del video). */
  t: number;
  x: number | null;
  y: number | null;
  /** Duración de la inferencia en el worker, en ms, si la librería la reporta. */
  inferenceMs: number | null;
}

export type DeviceType = "laptop" | "phone" | "tablet";

export interface Geometry {
  diagonalInches?: number;
  screenFormat?: string;
  /** Ancho de `window.screen` en píxeles CSS. */
  screenWidthPx: number;
  /** Ancho físico de la pantalla en cm (lo declara el evaluador). */
  screenWidthCm: number;
  /** Distancia aproximada de los ojos a la pantalla en cm. */
  distanceCm: number;
}

/** Criterios de salida del spike (docs/EYETRACKING-DECISION.md §6). La tableta usa el de celular. */
export const THRESHOLDS = {
  maxMedianErrorDeg: { laptop: 4, phone: 6, tablet: 6 } satisfies Record<DeviceType, number>,
  minFps: 15,
  /** Mínimo de lecturas válidas en una ventana para dar por medido un objetivo. */
  minSamplesPerTarget: 5,
} as const;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Percentil con interpolación lineal; p en [0, 1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = Math.min(Math.max(p, 0), 1) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pxToCm(px: number, g: Geometry): number {
  return px * (g.screenWidthCm / g.screenWidthPx);
}

/** Ángulo visual (grados) que subtiende `cm` a la distancia declarada, mirando de frente. */
export function cmToDeg(cm: number, distanceCm: number): number {
  return (Math.atan2(cm, distanceCm) * 180) / Math.PI;
}

export function pxToDeg(px: number, g: Geometry): number {
  return cmToDeg(pxToCm(px, g), g.distanceCm);
}

/**
 * WebEyeTrack 0.0.2 conserva solo las últimas `maxPoints` (5) muestras de calibración y, al llegar la
 * siguiente, ajusta con ellas una matriz afín: en la práctica pesan los últimos 6 clics. Por eso el
 * orden importa más que la cantidad (se comprobó leyendo `pruneCalibData`/`adapt` del bundle).
 */
export const LIBRARY_CALIBRATION_WINDOW = 6;

/**
 * Cuadrícula 3×3 de calibración con margen del 10 %. Se recorre de modo que los últimos
 * LIBRARY_CALIBRATION_WINDOW puntos (los únicos que cuentan) incluyan las 4 esquinas y el centro:
 * puntos medios de los bordes primero, esquinas después y el centro al final.
 * Dos puntos consecutivos quedan siempre a más de 5 % entre sí (la librería ignora clics más cercanos).
 */
export function calibrationGrid(width: number, height: number): Point[] {
  const fractions: [number, number][] = [
    [0.5, 0.1],
    [0.5, 0.9],
    [0.1, 0.5],
    [0.9, 0.5],
    [0.1, 0.1],
    [0.9, 0.9],
    [0.9, 0.1],
    [0.1, 0.9],
    [0.5, 0.5],
  ];
  return fractions.map(([fx, fy]) => ({ x: fx * width, y: fy * height }));
}

/**
 * Objetivos de validación: ocho puntos que NO coinciden con ninguno de calibración, para medir
 * generalización y no memoria. Orden alternado para evitar sacádicos cortos entre vecinos.
 */
export function validationTargets(width: number, height: number): Point[] {
  const fractions: [number, number][] = [
    [0.3, 0.3],
    [0.7, 0.7],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.5, 0.2],
    [0.5, 0.8],
    [0.2, 0.5],
    [0.8, 0.5],
  ];
  return fractions.map(([fx, fy]) => ({ x: fx * width, y: fy * height }));
}

export interface TargetResult {
  target: Point;
  /** Lecturas válidas dentro de la ventana de medición. */
  samples: number;
  /** Mediana de las lecturas; null si no hubo suficientes. */
  gaze: Point | null;
  errorPx: number | null;
  /** Dispersión: RMS de la distancia entre lecturas consecutivas (px). Menor = más estable. */
  precisionPx: number | null;
}

/** Evalúa un objetivo con las lecturas cuyo `t` cae en [from, to). */
export function evaluateTarget(
  target: Point,
  frames: GazeFrame[],
  from: number,
  to: number,
  minSamples: number = THRESHOLDS.minSamplesPerTarget,
): TargetResult {
  const pts: Point[] = [];
  for (const f of frames) {
    if (f.t >= from && f.t < to && f.x !== null && f.y !== null && Number.isFinite(f.x) && Number.isFinite(f.y)) {
      pts.push({ x: f.x, y: f.y });
    }
  }
  if (pts.length < minSamples) return { target, samples: pts.length, gaze: null, errorPx: null, precisionPx: null };

  const gaze = { x: median(pts.map((p) => p.x)), y: median(pts.map((p) => p.y)) };
  let sumSq = 0;
  for (let i = 1; i < pts.length; i++) sumSq += distance(pts[i], pts[i - 1]) ** 2;
  return {
    target,
    samples: pts.length,
    gaze,
    errorPx: distance(gaze, target),
    precisionPx: Math.sqrt(sumSq / (pts.length - 1)),
  };
}

export interface FrameStats {
  /** Lecturas recibidas por segundo (válidas o no). */
  fps: number;
  /** Fracción de lecturas válidas (ojos abiertos, cara detectada). */
  validRatio: number;
  inferenceMsMedian: number | null;
  frames: number;
}

/** Estadísticas de flujo de lecturas en [from, to). */
export function frameStats(frames: GazeFrame[], from: number, to: number): FrameStats {
  const inWindow = frames.filter((f) => f.t >= from && f.t < to);
  const seconds = (to - from) / 1000;
  const valid = inWindow.filter((f) => f.x !== null && f.y !== null).length;
  const inference = inWindow.map((f) => f.inferenceMs).filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    fps: seconds > 0 ? inWindow.length / seconds : 0,
    validRatio: inWindow.length ? valid / inWindow.length : 0,
    inferenceMsMedian: inference.length ? median(inference) : null,
    frames: inWindow.length,
  };
}

export interface Summary {
  targets: number;
  measured: number;
  /** Fracción de objetivos con lecturas suficientes. */
  coverage: number;
  medianErrorPx: number | null;
  meanErrorPx: number | null;
  p75ErrorPx: number | null;
  maxErrorPx: number | null;
  medianErrorCm: number | null;
  medianErrorDeg: number | null;
  p75ErrorDeg: number | null;
  medianPrecisionPx: number | null;
}

export function summarize(results: TargetResult[], g: Geometry): Summary {
  const errs = results.map((r) => r.errorPx).filter((v): v is number => v !== null);
  const precs = results.map((r) => r.precisionPx).filter((v): v is number => v !== null);
  const empty = errs.length === 0;
  const medErr = empty ? null : median(errs);
  const p75 = empty ? null : percentile(errs, 0.75);
  return {
    targets: results.length,
    measured: errs.length,
    coverage: results.length ? errs.length / results.length : 0,
    medianErrorPx: medErr,
    meanErrorPx: empty ? null : errs.reduce((a, b) => a + b, 0) / errs.length,
    p75ErrorPx: p75,
    maxErrorPx: empty ? null : Math.max(...errs),
    medianErrorCm: medErr === null ? null : pxToCm(medErr, g),
    medianErrorDeg: medErr === null ? null : pxToDeg(medErr, g),
    p75ErrorDeg: p75 === null ? null : pxToDeg(p75, g),
    medianPrecisionPx: precs.length ? median(precs) : null,
  };
}

export interface AxisFit {
  /** Pendiente de mirada = offset + gain · objetivo. 1 es lo ideal; < 1 indica respuesta comprimida. */
  gain: number | null;
  /** Ordenada de la recta en píxeles. */
  offsetPx: number | null;
  /** Qué tanto de la variación de la mirada explica el objetivo (0–1). */
  r2: number | null;
  /** Sesgo medio con signo: mirada − objetivo, en píxeles. */
  biasPx: number | null;
}

/** Regresión lineal de la mirada mediana contra la posición del objetivo en un eje (mín. 3 objetivos medidos). */
export function axisFit(results: TargetResult[], axis: "x" | "y"): AxisFit {
  const pts = results.filter((r): r is TargetResult & { gaze: Point } => r.gaze !== null);
  const empty: AxisFit = { gain: null, offsetPx: null, r2: null, biasPx: null };
  if (pts.length < 3) return empty;
  const xs = pts.map((r) => r.target[axis]);
  const ys = pts.map((r) => r.gaze[axis]);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return empty;
  const gain = sxy / sxx;
  return {
    gain,
    offsetPx: my - gain * mx,
    r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy),
    biasPx: ys.reduce((a, y, i) => a + (y - xs[i]), 0) / n,
  };
}

export interface ViewportSpan {
  widthCm: number;
  heightCm: number;
  /** Semiángulo visual (°) que abarca el área de prueba desde el centro, a la distancia declarada. */
  halfAngleXDeg: number;
  halfAngleYDeg: number;
}

/** Tamaño físico y ángulo visual del área de prueba; permite comparar un monitor grande con una laptop. */
export function viewportSpan(viewport: { width: number; height: number }, g: Geometry): ViewportSpan {
  const widthCm = pxToCm(viewport.width, g);
  const heightCm = pxToCm(viewport.height, g);
  return {
    widthCm,
    heightCm,
    halfAngleXDeg: cmToDeg(widthCm / 2, g.distanceCm),
    halfAngleYDeg: cmToDeg(heightCm / 2, g.distanceCm),
  };
}

export interface Verdict {
  pass: boolean;
  /** Un motivo por criterio incumplido; vacío si pasa. */
  reasons: string[];
}

/** Aplica los criterios de salida a una sesión. Una cobertura menor a 75 % invalida la medición. */
export function verdict(summary: Summary, fps: number, device: DeviceType): Verdict {
  const reasons: string[] = [];
  const limit = THRESHOLDS.maxMedianErrorDeg[device];
  if (summary.coverage < 0.75) {
    reasons.push(`Solo ${Math.round(summary.coverage * 100)} % de los objetivos tuvo lecturas suficientes (mínimo 75 %).`);
  }
  if (summary.medianErrorDeg === null) {
    reasons.push("No hubo ningún objetivo medido.");
  } else if (summary.medianErrorDeg > limit) {
    reasons.push(`Error mediano ${summary.medianErrorDeg.toFixed(1)}° > ${limit}° (${device}).`);
  }
  if (fps < THRESHOLDS.minFps) reasons.push(`${fps.toFixed(1)} lecturas/s < ${THRESHOLDS.minFps}.`);
  return { pass: reasons.length === 0, reasons };
}

/** Forma mínima de una sesión guardada, la que consume `aggregateSessions`. */
export interface SessionRecord {
  participant: string;
  device: DeviceType;
  summary: Summary;
  fps: number;
  verdict: Verdict;
}

export interface DeviceAggregate {
  device: DeviceType;
  sessions: number;
  passed: number;
  /** Mediana entre sesiones de su error mediano (°). */
  medianOfMedianDeg: number | null;
  worstMedianDeg: number | null;
  medianFps: number | null;
}

/** Resume varias sesiones por tipo de dispositivo para decidir si seguimos con la librería. */
export function aggregateSessions(sessions: SessionRecord[]): DeviceAggregate[] {
  const devices: DeviceType[] = ["laptop", "phone", "tablet"];
  return devices
    .map((device) => {
      const rows = sessions.filter((s) => s.device === device);
      const degs = rows.map((r) => r.summary.medianErrorDeg).filter((v): v is number => v !== null);
      return {
        device,
        sessions: rows.length,
        passed: rows.filter((r) => r.verdict.pass).length,
        medianOfMedianDeg: degs.length ? median(degs) : null,
        worstMedianDeg: degs.length ? Math.max(...degs) : null,
        medianFps: rows.length ? median(rows.map((r) => r.fps)) : null,
      };
    })
    .filter((a) => a.sessions > 0);
}
