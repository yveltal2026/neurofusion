/**
 * Motor puro de Facial Coding (`fc-blendshape-v1`) a partir de los 52 coeficientes
 * de blendshapes ARKit y la matriz de transformación facial de MediaPipe FaceLandmarker.
 *
 * Sin I/O ni DOM: recibe estructuras numéricas simples, normaliza contra la línea
 * base neutra de cada participante, verifica los ángulos de pose de cabeza y produce
 * 12 Action Units (FACS) cuantizadas (0..100), estado de parpadeo (AU45) e índices
 * compuestos de expresión observada.
 */

export const FACIAL_CODING_VERSION = "fc-blendshape-v1";

export const POSE_THRESHOLDS_DEG = {
  maxAbsYawDeg: 35,
  maxAbsPitchDeg: 25,
  blinkScoreThreshold: 0.5,
} as const;

/** Categoría individual devuelta por MediaPipe (`result.faceBlendshapes[0].categories`). */
export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

/** Mapa de coeficientes por nombre de blendshape ARKit en [0, 1]. */
export type BlendshapeMap = Readonly<Record<string, number>>;

/** Línea base individual calculada durante la ventana neutra previa al estímulo. */
export interface FacialBaseline {
  readonly version: typeof FACIAL_CODING_VERSION;
  readonly sampleCount: number;
  readonly channels: Readonly<Record<string, number>>;
}

export interface HeadPoseDeg {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  poseValid: boolean;
}

/** 12 Action Units (FACS) en escala entera 0..100 + parpadeo e índices compuestos. */
export interface FacialActionUnits {
  /** Inner Brow Raiser */
  au01: number;
  /** Outer Brow Raiser */
  au02: number;
  /** Brow Lowerer (ceño fruncido) */
  au04: number;
  /** Cheek Raiser (marcador Duchenne) */
  au06: number;
  /** Lid Tightener */
  au07: number;
  /** Nose Wrinkler */
  au09: number;
  /** Upper Lip Raiser */
  au10: number;
  /** Lip Corner Puller (sonrisa) */
  au12: number;
  /** Dimpler */
  au14: number;
  /** Lip Corner Depressor */
  au15: number;
  /** Lip Pressor */
  au24: number;
  /** Jaw Drop / Lips Part */
  au26: number;
  /** Parpadeo activo (AU45) medido sobre la apertura ocular cruda. */
  blink: boolean;
}

export interface FacialAffectIndices {
  /** Afinidad / sonrisa Duchenne ponderada (0..100). */
  smile: number;
  /** Fricción / ceño o rechazo facial (0..100). */
  friction: number;
  /** Valencia facial observada (-100..100): smile - friction. */
  valence: number;
  /** Apertura / sorpresa facial (0..100). */
  surprise: number;
  /** Nivel global de activación expresiva RMS sobre las 12 AUs (0..100). */
  expressiveness: number;
}

export interface FacialCodingReading extends FacialActionUnits, FacialAffectIndices {
  poseValid: boolean;
  pose: HeadPoseDeg | null;
}

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

const toPct = (v: number): number => Math.round(clamp01(v) * 100);

const medianOf = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Convierte el arreglo de categorías de MediaPipe en un diccionario seguro en [0, 1]. */
export function categoriesToBlendshapeMap(
  categories: readonly BlendshapeCategory[],
): BlendshapeMap {
  const out: Record<string, number> = {};
  for (const item of categories) {
    if (item && typeof item.categoryName === "string") {
      out[item.categoryName] = clamp01(item.score);
    }
  }
  return out;
}

/**
 * Extrae yaw, pitch y roll (en grados) desde la matriz 4×4 column-major que
 * devuelve MediaPipe (`facialTransformationMatrixes[0].data`).
 */
export function extractHeadPoseDeg(
  matrixData: ArrayLike<number> | null | undefined,
): HeadPoseDeg | null {
  if (!matrixData || matrixData.length < 16) return null;
  // MediaPipe almacena la matriz 4x4 en orden column-major:
  // col 0: m[0], m[1], m[2]
  // col 1: m[4], m[5], m[6]
  // col 2: m[8], m[9], m[10]
  const r00 = Number(matrixData[0]);
  const r10 = Number(matrixData[1]);
  const r20 = Number(matrixData[2]);
  const r21 = Number(matrixData[6]);
  const r22 = Number(matrixData[10]);
  if (![r00, r10, r20, r21, r22].every(Number.isFinite)) return null;

  const radToDeg = 180 / Math.PI;
  const pitchDeg = Math.atan2(-r21, r22) * radToDeg;
  const yawDeg =
    Math.atan2(r20, Math.hypot(r21, r22)) * radToDeg;
  const rollDeg = Math.atan2(r10, r00) * radToDeg;

  const poseValid =
    Math.abs(yawDeg) <= POSE_THRESHOLDS_DEG.maxAbsYawDeg &&
    Math.abs(pitchDeg) <= POSE_THRESHOLDS_DEG.maxAbsPitchDeg;

  const roundDeg = (v: number): number => Math.round(v * 100) / 100 || 0;
  return {
    yawDeg: roundDeg(yawDeg),
    pitchDeg: roundDeg(pitchDeg),
    rollDeg: roundDeg(rollDeg),
    poseValid,
  };
}

/**
 * Calcula la mediana por canal durante la ventana de calibración neutra (p. ej. 2–3 s
 * previos al inicio del video). Ignora muestras vacías.
 */
export function computeFacialBaseline(
  frames: readonly BlendshapeMap[],
): FacialBaseline {
  const buckets = new Map<string, number[]>();
  let validFrames = 0;
  for (const frame of frames) {
    const keys = Object.keys(frame);
    if (!keys.length) continue;
    validFrames++;
    for (const key of keys) {
      const val = frame[key];
      if (!Number.isFinite(val)) continue;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(clamp01(val));
    }
  }
  const channels: Record<string, number> = {};
  for (const [key, values] of buckets.entries()) {
    channels[key] = medianOf(values);
  }
  return {
    version: FACIAL_CODING_VERSION,
    sampleCount: validFrames,
    channels,
  };
}

/**
 * Resta la línea base personal de un canal y reescala el rango restante a [0, 1].
 * El tope de 0.7 evita amplificar ruido si la persona sonrió o frunció durante la base.
 */
export function normalizeChannel(
  rawScore: number | undefined,
  baselineScore: number | undefined,
): number {
  const raw = clamp01(rawScore ?? 0);
  const base = Math.min(0.7, clamp01(baselineScore ?? 0));
  if (raw <= base) return 0;
  return clamp01((raw - base) / (1 - base));
}

/** Evalúa un fotograma de blendshapes + pose y devuelve las 12 FACS AUs e índices compuestos. */
export function evaluateFacialFrame(
  blendshapes: BlendshapeMap,
  options?: {
    baseline?: FacialBaseline | null;
    matrixData?: ArrayLike<number> | null;
  },
): FacialCodingReading {
  const base = options?.baseline?.channels ?? {};
  const ch = (name: string): number =>
    normalizeChannel(blendshapes[name], base[name]);
  const bilateral = (left: string, right: string): number =>
    (ch(left) + ch(right)) / 2;

  // Parpadeo (AU45) se evalúa sobre los coeficientes crudos de cierre palpebral
  // para no perder parpadeos si la línea base capturó un instante semientornado.
  const rawBlink =
    (clamp01(blendshapes.eyeBlinkLeft ?? 0) +
      clamp01(blendshapes.eyeBlinkRight ?? 0)) /
    2;
  const blink = rawBlink >= POSE_THRESHOLDS_DEG.blinkScoreThreshold;

  const au01 = toPct(ch("browInnerUp"));
  const au02 = toPct(bilateral("browOuterUpLeft", "browOuterUpRight"));
  const au04 = toPct(bilateral("browDownLeft", "browDownRight"));
  const au06 = toPct(bilateral("cheekSquintLeft", "cheekSquintRight"));
  // Durante un parpadeo completo (AU45), los párpados arrastran eyeSquint; atenuamos AU07 en ese frame.
  const squintRaw = bilateral("eyeSquintLeft", "eyeSquintRight");
  const au07 = toPct(blink ? squintRaw * 0.25 : squintRaw);
  const au09 = toPct(bilateral("noseSneerLeft", "noseSneerRight"));
  const au10 = toPct(bilateral("mouthUpperUpLeft", "mouthUpperUpRight"));
  const au12 = toPct(bilateral("mouthSmileLeft", "mouthSmileRight"));
  const au14 = toPct(bilateral("mouthDimpleLeft", "mouthDimpleRight"));
  const au15 = toPct(bilateral("mouthFrownLeft", "mouthFrownRight"));
  const au24 = toPct(bilateral("mouthPressLeft", "mouthPressRight"));
  const jawOpen = ch("jawOpen");
  const lowerLipDepress = bilateral(
    "mouthLowerDownLeft",
    "mouthLowerDownRight",
  );
  const au26 = toPct(Math.max(jawOpen, 0.7 * lowerLipDepress));

  const smile = Math.min(
    100,
    Math.max(0, Math.round(0.65 * au12 + 0.35 * au06)),
  );
  const friction = Math.max(au04, au09, au10, au15);
  const valence = Math.min(100, Math.max(-100, smile - friction));
  const browRaiseMean = (au01 + au02) / 2;
  const surprise = Math.min(
    100,
    Math.max(0, Math.round(Math.sqrt(browRaiseMean * au26))),
  );

  const auVector = [
    au01,
    au02,
    au04,
    au06,
    au07,
    au09,
    au10,
    au12,
    au14,
    au15,
    au24,
    au26,
  ];
  const rms = Math.sqrt(
    auVector.reduce((acc, v) => acc + v * v, 0) / auVector.length,
  );
  const expressiveness = Math.min(100, Math.max(0, Math.round(rms)));

  const pose = extractHeadPoseDeg(options?.matrixData);
  const poseValid = pose ? pose.poseValid : true;

  return {
    au01,
    au02,
    au04,
    au06,
    au07,
    au09,
    au10,
    au12,
    au14,
    au15,
    au24,
    au26,
    blink,
    smile,
    friction,
    valence,
    surprise,
    expressiveness,
    poseValid,
    pose,
  };
}
