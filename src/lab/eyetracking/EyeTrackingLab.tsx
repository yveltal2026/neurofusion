"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Callout, ConsentCheck, FactList, ParticipantScreen, ReadingPanel, ScreenHeader, Section, StatusScreen } from "@/components/participant";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Field, Input } from "@/components/ui/field";
import {
  EngineError,
  checkCdnReachable,
  checkModelAssets,
  createWebEyeTrackEngine,
  type GazeEngine,
} from "./engine";
import {
  calibrationGrid,
  evaluateTarget,
  frameStats,
  validationTargets,
  type DeviceType,
  type GazeFrame,
  type Point,
  type TargetResult,
} from "./metrics";
import { ResultsView } from "./ResultsView";
import { buildSession, recordDriftChecks, type ExportedSession, type Lighting } from "./session";
import { collectEyeObservation } from "@/tools/visual/eye/samples";
import type { EyeObservation, EyeQuality } from "@/tools/visual/eye/schema";
import type { EyeStudyAsset } from "@/tools/visual/eye/participant.server";
import { applyCalibration, assessFixation, fitCalibration, moveSaturatedTarget, refineCalibration, refinementGrid, weakCalibrationPoints, type CalibrationFit, type CalibrationPair } from "./calibration";
import { buildDriftCheck, driftCheckpoints, driftFailures, driftFrameStats, driftSummary, driftTargets, unmeasuredDriftCheck, type DriftCheck, type DriftSummary } from "./drift";
import { screenWidthCm, screenWidthFromReference, type ScreenFormat } from "./screen";

type Stage = "setup" | "loading" | "position" | "calibration" | "countdown" | "validation" | "drift" | "recovery" | "preparing" | "results" | "free" | "stimulus" | "saving" | "done";

interface EyeStudyMode {
  token: string;
  title: string;
  assets: EyeStudyAsset[];
  durationSeconds: number;
  preview: boolean;
}

/** Tiempo para que el ojo llegue al punto antes de medir, y ventana de medición, por objetivo. */
const SETTLE_MS = 1000;
const MEASURE_MS = 1500;
/** Da tiempo a fijar la mirada antes de activar cada objetivo. */
const CALIB_ACTIVATE_MS = 1200;
const COUNTDOWN_S = 3;
/** Evita que el arreglo de lecturas crezca sin límite en el modo libre (≈ 10 min a 30 lecturas/s). */
const MAX_FRAMES = 20_000;

const PRESETS: Record<DeviceType, { inches: string; distanceCm: string; label: string }> = {
  laptop: { inches: "14", distanceCm: "50", label: "Laptop / escritorio" },
  phone: { inches: "6.1", distanceCm: "30", label: "Celular" },
  tablet: { inches: "11", distanceCm: "40", label: "Tableta" },
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function guessDevice(): DeviceType {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "laptop";
  return Math.min(window.screen.width, window.screen.height) < 600 ? "phone" : "tablet";
}

/**
 * La segunda etapa usa puntos interiores; la validación final tiene sus propios objetivos.
 */
function buildCalibrationPoints(passes: number): Point[] {
  const grid = calibrationGrid(window.innerWidth, window.innerHeight);
  return passes === 2 ? [...grid, ...refinementGrid(window.innerWidth, window.innerHeight)] : grid;
}

export function EyeTrackingLab({ study }: { study?: EyeStudyMode }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [error, setError] = useState<string | null>(null);

  // Formulario
  const [participant, setParticipant] = useState("");
  // Este componente solo se monta en el cliente (EyeTrackingLabClient), así que puede leer `window` al inicializar.
  const [device, setDevice] = useState<DeviceType>(guessDevice);
  const [inches, setInches] = useState("");
  const [screenMeasurement, setScreenMeasurement] = useState<"reference-card" | "diagonal">("reference-card");
  const [referenceWidth, setReferenceWidth] = useState(200);
  const [measuredReferenceWidth, setMeasuredReferenceWidth] = useState(200);
  const referenceCardRef = useRef<HTMLDivElement | null>(null);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [referenceGeometry, setReferenceGeometry] = useState("");
  const screenGeometryKey = () => `${window.screen.width}:${window.screen.height}:${window.devicePixelRatio}:${window.innerWidth}`;
  useEffect(() => {
    const invalidate = () => { if (referenceGeometry !== screenGeometryKey()) setReferenceConfirmed(false); };
    window.addEventListener("resize", invalidate);
    return () => window.removeEventListener("resize", invalidate);
  }, [referenceGeometry]);
  const [screenFormat, setScreenFormat] = useState<ScreenFormat>("auto");
  const physicalScreenWidth = screenMeasurement === "reference-card"
    ? screenWidthFromReference(measuredReferenceWidth, window.screen.width)
    : screenWidthCm(Number(inches), screenFormat, window.screen.width, window.screen.height);
  const [distanceCm, setDistanceCm] = useState(() => PRESETS[guessDevice()].distanceCm);
  const [glasses, setGlasses] = useState(false);
  const [lighting, setLighting] = useState<Lighting>("buena");
  const [passes, setPasses] = useState(2);

  // Progreso
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  const [calibIndex, setCalibIndex] = useState(0);
  /** Índice del punto ya “armado”; el punto actual está activo solo si coincide con `calibIndex`. */
  const [armedIndex, setArmedIndex] = useState(-1);
  const [samplingIndex, setSamplingIndex] = useState(-1);
  const [reviewingCalibration, setReviewingCalibration] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);
  const [valIndex, setValIndex] = useState(0);
  const [valTargets, setValTargets] = useState<Point[]>([]);
  const [live, setLive] = useState({ fps: 0, faceOk: false, gazeOk: false });
  const [session, setSession] = useState<ExportedSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [consent, setConsent] = useState(false);
  const [stimulusIndex, setStimulusIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [studyBusy, setStudyBusy] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [limitedReady, setLimitedReady] = useState(false);
  const [measurementLimited, setMeasurementLimited] = useState(false);
  const [lastDriftCheck, setLastDriftCheck] = useState<DriftCheck | null>(null);
  const [diagnosticsEnabled] = useState(() => Boolean(study?.preview) || new URLSearchParams(window.location.search).get("diagnostic") === "1");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoParkingRef = useRef<HTMLDivElement | null>(null);
  const videoPreviewRef = useRef<HTMLDivElement | null>(null);

  // El mismo elemento conserva el stream al pasar de carga a posición o recuperación.
  // React administra los contenedores; este efecto administra únicamente el video.
  useEffect(() => {
    const video = videoRef.current ?? document.createElement("video");
    videoRef.current = video;
    video.id = "webeyetrack-video";
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.width = 640;
    video.height = 480;
    const show = stage === "position" || stage === "recovery";
    video.setAttribute("aria-label", "Vista de tu cámara");
    video.setAttribute("aria-hidden", String(!show));
    video.className = show
      ? "mx-auto aspect-4/3 w-60 max-w-full -scale-x-100 rounded-md border border-border bg-black object-contain"
      : "pointer-events-none fixed top-0 left-0 size-px opacity-0";
    (videoPreviewRef.current ?? videoParkingRef.current)?.appendChild(video);
    if (video.srcObject) void video.play().catch(() => setError("No se pudo reanudar la cámara. Vuelve a iniciarla."));
  }, [stage]);
  useEffect(() => () => { videoRef.current?.remove(); }, []);
  const stimulusImgRef = useRef<HTMLImageElement | null>(null);
  const studySessionIdRef = useRef<string | null>(null);
  const observationsRef = useRef<EyeObservation[]>([]);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GazeEngine | null>(null);
  const framesRef = useRef<GazeFrame[]>([]);
  const rawFramesRef = useRef<GazeFrame[]>([]);
  const calibrationFitRef = useRef<CalibrationFit | null>(null);
  const calibrationPairsRef = useRef<CalibrationPair[]>([]);
  const calibrationQueueRef = useRef<number[]>([]);
  const calibrationReviewDoneRef = useRef(false);
  const calibrationAttemptsRef = useRef(0);
  const relocatedPointsRef = useRef<number[]>([]);
  const reviewedPointsRef = useRef<number[]>([]);
  const driftChecksRef = useRef<DriftCheck[]>([]);
  const measurementLimitedRef = useRef(false);
  const confirmedCountRef = useRef(0);
  const recoveringRef = useRef(false);
  const recoveryCountRef = useRef(0);
  const recalibrationCountRef = useRef(0);
  const recoveryChecksRef = useRef<DriftSummary[]>([]);
  const presentedAssetsRef = useRef(new Set<string>());
  const repeatedAssetsRef = useRef(new Set<string>());
  const calibrationEpochRef = useRef(0);
  const studyValidationsRef = useRef(new Map<number, ExportedSession>());
  const calibrationViewportRef = useRef({ width: 0, height: 0 });
  const readyMsRef = useRef(0);
  const calibStartRef = useRef(0);
  const calibClicksRef = useRef(0);
  const calibDurationRef = useRef(0);
  const lastClickRef = useRef(0);
  const runIdRef = useRef(0);

  const recoverStudy = useCallback((message: string, invalidateFit = false) => {
    if (!study) return;
    runIdRef.current++;
    recoveringRef.current = true;
    recoveryCountRef.current = Math.min(100, recoveryCountRef.current + 1);
    setLimitedReady(recoveryCountRef.current >= 2 && recoveryChecksRef.current.some((check) => !check.passed));
    const confirmed = confirmedCountRef.current;
    setResumeCount(confirmed);
    for (const asset of study.assets.slice(confirmed)) {
      if (presentedAssetsRef.current.has(asset.id)) repeatedAssetsRef.current.add(asset.id);
    }
    // Sólo se descartan las imágenes cuyo bloque aún no pasó un control posterior.
    observationsRef.current = observationsRef.current.slice(0, confirmed);
    driftChecksRef.current = driftChecksRef.current.filter((c) => c.afterAssetCount <= confirmed);
    if (invalidateFit) calibrationFitRef.current = null;
    setStimulusIndex(confirmed);
    setNeedsCalibration(!calibrationFitRef.current);
    setError(message);
    setStage("recovery");
  }, [study]);

  // Evita el ajuste incremental de WebEyeTrack por clics globales. Usamos todas las fijaciones
  // en un ajuste propio; React recibe los clics antes de que alcancen document/window.
  useEffect(() => {
    const block = (e: MouseEvent) => e.stopPropagation();
    document.addEventListener("click", block);
    return () => {
      document.removeEventListener("click", block);
    };
  }, []);

  // Al salir: cancela cualquier validación en curso y apaga la cámara.
  const teardown = useCallback(() => {
    runIdRef.current++;
    engineRef.current?.stop();
    engineRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  // Pantalla completa de pruebas: sin scroll para que innerWidth/innerHeight no cambien a media prueba.
  const immersive = stage === "calibration" || stage === "countdown" || stage === "validation" || stage === "drift" || stage === "free" || stage === "stimulus";
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  useEffect(() => {
    if (!["calibration", "countdown", "validation", "drift", "preparing"].includes(stage)) return;
    const interrupt = (event: Event) => {
      if (event.type === "resize" && window.innerWidth === calibrationViewportRef.current.width && window.innerHeight === calibrationViewportRef.current.height) return;
      if (study && (recoveringRef.current || studySessionIdRef.current)) {
        recoverStudy("La prueba se pausó. Conservamos las imágenes ya validadas. Revisa tu posición para continuar.",
          window.innerWidth !== calibrationViewportRef.current.width || window.innerHeight !== calibrationViewportRef.current.height || !calibrationFitRef.current);
        return;
      }
      runIdRef.current++;
      calibrationFitRef.current = null;
      setNeedsCalibration(true);
      setError("La prueba se interrumpió o cambió la ventana. Repite la calibración sin cambiar de pestaña ni tamaño.");
      setStage("position");
    };
    const visibility = (event: Event) => { if (document.hidden) interrupt(event); };
    window.addEventListener("resize", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("resize", interrupt);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stage, study, recoverStudy]);

  // Indicadores en vivo (sin re-renderizar a la frecuencia de la cámara).
  useEffect(() => {
    if (stage !== "position" && stage !== "recovery") return;
    const id = setInterval(() => {
      const now = performance.now();
      const recent = framesRef.current.filter((f) => f.t > now - 1000);
      setLive({ fps: recent.length, faceOk: recent.some((f) => f.faceDetected ?? (f.x !== null)), gazeOk: recent.some((f) => f.x !== null && f.y !== null) });
    }, 400);
    return () => clearInterval(id);
  }, [stage]);

  const onFrame = useCallback((f: GazeFrame) => {
    rawFramesRef.current.push(f);
    if (rawFramesRef.current.length > MAX_FRAMES) rawFramesRef.current.splice(0, MAX_FRAMES / 2);
    const fit = calibrationFitRef.current;
    if (fit && f.x !== null && f.y !== null) {
      const point = applyCalibration(fit, { x: f.x / window.innerWidth, y: f.y / window.innerHeight });
      f = { ...f, x: point.x * window.innerWidth, y: point.y * window.innerHeight };
    }
    const frames = framesRef.current;
    frames.push(f);
    if (frames.length > MAX_FRAMES) frames.splice(0, MAX_FRAMES / 2);
    const dot = dotRef.current;
    if (dot) {
      if (f.x !== null && f.y !== null) {
        dot.style.transform = `translate(${f.x - 15}px, ${f.y - 15}px)`;
        dot.style.opacity = "0.7";
      } else {
        dot.style.opacity = "0";
      }
    }
  }, []);

  async function start() {
    setError(null);
    const referenceOk = screenMeasurement !== "reference-card" || (referenceConfirmed && referenceGeometry === screenGeometryKey());
    const geometryOk = referenceOk && Number.isFinite(physicalScreenWidth)
      && Number.isFinite(Number(distanceCm)) && Number(distanceCm) >= 10 && Number(distanceCm) <= 200;
    if (!study && !participant.trim()) return setError("Escribe un código para la persona (por ejemplo P01). No uses nombres.");
    if (study && !consent) return setError("Debes aceptar el uso de la cámara y el almacenamiento de coordenadas de mirada para participar.");
    if (!geometryOk) return setError(screenMeasurement === "reference-card"
      ? "Ajusta y confirma la tarjeta con el tamaño actual de pantalla. Indica una distancia entre 10 y 200 cm."
      : "Indica una diagonal entre 3 y 100 pulgadas y una distancia entre 10 y 200 cm.");

    setStage("loading");
    try {
      // `?engine=fake` usa un simulador (puntero como mirada) para probar el flujo sin cámara ni modelos.
      const fake = new URLSearchParams(window.location.search).get("engine") === "fake";
      if (study && !study.preview && fake) {
        throw new EngineError("El simulador sólo está disponible en la vista previa del estudio.", "model-missing");
      }
      if (!fake) {
        await checkModelAssets();
        await checkCdnReachable();
      }
      const engine = fake ? (await import("./engine.fake")).createFakeEngine() : createWebEyeTrackEngine();
      engineRef.current = engine;
      framesRef.current = [];
      rawFramesRef.current = [];
      calibrationFitRef.current = null;
      const video = videoRef.current;
      if (!video) throw new EngineError("No se encontró el elemento de video.", "camera-error");
      const { readyMs } = await engine.start(video, onFrame);
      readyMsRef.current = readyMs;
      setStage("position");
    } catch (err) {
      engineRef.current?.stop();
      engineRef.current = null;
      setError(err instanceof Error ? err.message : "No se pudo iniciar el eye tracking.");
      setStage("setup");
    }
  }

  function startCalibration() {
    calibrationEpochRef.current++;
    setLastDriftCheck(null);
    if (study && recoveringRef.current) {
      recalibrationCountRef.current = Math.min(100, recalibrationCountRef.current + 1);
    } else {
      setResumeCount(null);
      setLimitedReady(false);
      measurementLimitedRef.current = false;
      setMeasurementLimited(false);
      confirmedCountRef.current = 0;
      recoveryCountRef.current = 0;
      recalibrationCountRef.current = 0;
      recoveryChecksRef.current = [];
      presentedAssetsRef.current.clear();
      repeatedAssetsRef.current.clear();
      studyValidationsRef.current.clear();
      driftChecksRef.current = [];
      observationsRef.current = [];
    }
    runIdRef.current++;
    calibrationFitRef.current = null;
    calibrationPairsRef.current = [];
    calibrationReviewDoneRef.current = false;
    calibrationAttemptsRef.current = 0;
    relocatedPointsRef.current = [];
    reviewedPointsRef.current = [];
    setReviewingCalibration(false);
    setNeedsCalibration(false);
    setSession(null);
    calibrationViewportRef.current = { width: window.innerWidth, height: window.innerHeight };
    setError(null);
    const points = buildCalibrationPoints(passes);
    calibrationQueueRef.current = points.map((_, i) => i).slice(1);
    setCalibPoints(points);
    setCalibIndex(0);
    setArmedIndex(-1);
    setSamplingIndex(-1);
    calibClicksRef.current = 0;
    lastClickRef.current = 0;
    calibStartRef.current = performance.now();
    setStage("calibration");
  }

  // Cada punto se activa después de dar tiempo a llevar la mirada hasta él.
  useEffect(() => {
    if (stage !== "calibration") return;
    const id = setTimeout(() => setArmedIndex(calibIndex), CALIB_ACTIVATE_MS);
    return () => clearTimeout(id);
  }, [stage, calibIndex, calibPoints]);
  const dotActive = stage === "calibration" && armedIndex === calibIndex;
  const dotSampling = stage === "calibration" && samplingIndex === calibIndex;

  async function onCalibrationDot() {
    setError(null);
    const now = performance.now();
    if (now - lastClickRef.current < 1000) return;
    lastClickRef.current = now;
    calibrationAttemptsRef.current++;
    setArmedIndex(-1);
    setSamplingIndex(calibIndex);
    const runId = runIdRef.current;
    const viewport = calibrationViewportRef.current;
    let fixation: ReturnType<typeof assessFixation> = { ok: false, reason: "unstable" };
    // Espera una ventana estable después del clic, hasta un máximo de 3 s.
    await sleep(1000);
    while (performance.now() - now <= 3200) {
      if (runId !== runIdRef.current) return;
      const end = performance.now();
      fixation = assessFixation(rawFramesRef.current, Math.max(now + 200, end - 800), end, viewport);
      if (fixation.ok || fixation.reason === "saturated") break;
      await sleep(200);
    }
    if (runId !== runIdRef.current) return;
    setSamplingIndex(-1);
    if (window.innerWidth !== viewport.width || window.innerHeight !== viewport.height) {
      setError("La ventana cambió de tamaño. Repite la calibración con la ventana estable.");
      setStage("position");
      return;
    }
    if (!fixation.ok) {
      if (fixation.reason === "saturated") {
        const point = calibPoints[calibIndex];
        const moved = moveSaturatedTarget({ x: point.x / viewport.width, y: point.y / viewport.height }, fixation.saturation!);
        if (moved && relocatedPointsRef.current.filter((i) => i === calibIndex).length < 2) {
          relocatedPointsRef.current.push(calibIndex);
          setCalibPoints((points) => points.map((p, i) => i === calibIndex ? { x: moved.x * viewport.width, y: moved.y * viewport.height } : p));
          setError("La estimación alcanzó el borde. Movimos este punto hacia el centro; míralo y vuelve a pulsarlo.");
          return;
        }
        setError("La estimación sigue bloqueada en el borde. Ajusta la cámara y vuelve a calibrar.");
        return;
      }
      setError("No se obtuvo una fijación estable. Mantén la cabeza quieta, mira el punto y vuelve a pulsarlo.");
      setArmedIndex(calibIndex);
      return;
    }
    calibrationPairsRef.current[calibIndex] = { gaze: fixation.gaze, quality: fixation.quality, phase: calibIndex < 9 ? "base" : "refinement", target: { x: calibPoints[calibIndex].x / viewport.width, y: calibPoints[calibIndex].y / viewport.height } };
    calibClicksRef.current = calibrationPairsRef.current.filter(Boolean).length;
    try {
      if (calibClicksRef.current >= 9) {
        calibrationFitRef.current = fitCalibration(calibrationPairsRef.current.slice(0, 9));
      }
      if (calibClicksRef.current === 18 && calibrationFitRef.current) {
        calibrationFitRef.current = refineCalibration(calibrationFitRef.current, calibrationPairsRef.current.slice(9));
      }
    } catch (cause) {
      calibrationFitRef.current = null;
      setError(cause instanceof Error ? cause.message : "No se pudo calibrar la mirada.");
      setStage("position");
      return;
    }
    if (!calibrationQueueRef.current.length && !calibrationReviewDoneRef.current) {
      calibrationReviewDoneRef.current = true;
      const weak = weakCalibrationPoints(calibrationPairsRef.current);
      calibrationQueueRef.current = weak;
      reviewedPointsRef.current = [...weak];
      if (weak.length) {
        setReviewingCalibration(true);
        setError("Vamos a repetir sólo los puntos menos fiables antes de validar.");
      }
    }
    const next = calibrationQueueRef.current.shift();
    if (next === undefined) {
      calibDurationRef.current = performance.now() - calibStartRef.current;
      setCountdown(COUNTDOWN_S);
      setStage("countdown");
    } else {
      setCalibIndex(next);
      if (next === calibIndex) setArmedIndex(next);
    }
  }

  const runValidation = useCallback(async () => {
    if (!calibrationFitRef.current || window.innerWidth !== calibrationViewportRef.current.width || window.innerHeight !== calibrationViewportRef.current.height) {
      setError("La ventana cambió desde la calibración. Repite la calibración con el tamaño actual.");
      setStage("position");
      return;
    }
    const runId = ++runIdRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targets = validationTargets(vw, vh);
    setValTargets(targets);
    setValIndex(0);
    setStage("validation");
    if (!recoveringRef.current) driftChecksRef.current = [];

    const startedAt = performance.now();
    const results: TargetResult[] = [];
    for (let i = 0; i < targets.length; i++) {
      setValIndex(i);
      const t0 = performance.now();
      await sleep(SETTLE_MS + MEASURE_MS);
      if (runIdRef.current !== runId) return;
      results.push(evaluateTarget(targets[i], framesRef.current, t0 + SETTLE_MS, t0 + SETTLE_MS + MEASURE_MS));
    }
    const endedAt = performance.now();

    if (window.innerWidth !== vw || window.innerHeight !== vh) {
      setError("La ventana cambió de tamaño durante la validación (¿giraste el dispositivo?). Repite la validación sin moverlo.");
      setStage("position");
      return;
    }

    const orientation = window.screen.orientation?.type ?? null;
    setSession(
      buildSession({
        participant,
        device,
        glasses,
        lighting,
        geometry: { screenWidthPx: window.screen.width, screenWidthCm: physicalScreenWidth, distanceCm: Number(distanceCm),
          measurementMethod: screenMeasurement,
          ...(screenMeasurement === "reference-card" ? { referenceWidthPx: measuredReferenceWidth } : { diagonalInches: Number(inches), screenFormat }) },
        viewport: { width: vw, height: vh },
        environment: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          devicePixelRatio: window.devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
          orientation,
        },
        engineId: engineRef.current?.id ?? "desconocido",
        readyMs: readyMsRef.current,
        calibration: { passes, clicks: calibClicksRef.current, durationMs: Math.round(calibDurationRef.current), layout: passes === 2 ? "v5-weighted-refinement" : "v5-weighted-base", pairs: calibrationPairsRef.current, fit: calibrationFitRef.current ?? undefined, attempts: calibrationAttemptsRef.current, reviewedPoints: reviewedPointsRef.current, relocatedPoints: relocatedPointsRef.current },
        validation: { results, stream: frameStats(framesRef.current, startedAt, endedAt), durationMs: Math.round(endedAt - startedAt) },
        createdAt: new Date(),
      }),
    );
    setStage("results");
  }, [participant, device, glasses, lighting, inches, screenFormat, distanceCm, passes, physicalScreenWidth, screenMeasurement, measuredReferenceWidth]);

  const runDriftCheck = useCallback(async (afterAssetCount: number): Promise<boolean | null> => {
    if (!session) return false;
    if (measurementLimitedRef.current && (!calibrationFitRef.current || window.innerWidth !== session.viewport.width || window.innerHeight !== session.viewport.height)) {
      const check = unmeasuredDriftCheck(afterAssetCount);
      driftChecksRef.current = [...driftChecksRef.current.filter((c) => c.afterAssetCount !== afterAssetCount), check].sort((a, b) => a.afterAssetCount - b.afterAssetCount);
      return true;
    }
    if (!calibrationFitRef.current) return false;
    const runId = ++runIdRef.current;
    const { width, height } = session.viewport;
    if (window.innerWidth !== width || window.innerHeight !== height) {
      if (study) {
        recoverStudy("Cambió el tamaño de la ventana. Recalibra para continuar conservando tu avance validado.", true);
        return false;
      }
      setNeedsCalibration(true);
      calibrationFitRef.current = null;
      setError("La ventana cambió. Recalibra antes de continuar.");
      setStage("results");
      return false;
    }
    const targets = driftTargets(width, height);
    setValTargets(targets);
    setValIndex(0);
    setError(null);
    setStage("drift");
    const windows: { from: number; to: number }[] = [];
    const results: TargetResult[] = [];
    for (let i = 0; i < targets.length; i++) {
      setValIndex(i);
      const from = performance.now();
      await sleep(SETTLE_MS + 1000);
      if (runIdRef.current !== runId) return null;
      let window = { from: from + SETTLE_MS, to: from + SETTLE_MS + 1000 };
      let result = evaluateTarget(targets[i], framesRef.current, window.from, window.to);
      // Una sola recaptura del mismo punto por pérdida de lecturas; nunca se reajusta para reducir el error angular.
      if (study && (result.gaze === null || driftFrameStats(framesRef.current, [window]).validRatio < 0.8)) {
        const retryFrom = performance.now();
        await sleep(1500);
        if (runIdRef.current !== runId) return null;
        window = { from: retryFrom, to: retryFrom + 1500 };
        result = evaluateTarget(targets[i], framesRef.current, window.from, window.to);
      }
      windows.push(window);
      results.push(result);
    }
    const check = buildDriftCheck(afterAssetCount, results,
      driftFrameStats(framesRef.current, windows), session.geometry, device);
    setLastDriftCheck(check);
    if (study) {
      if (measurementLimitedRef.current) {
        driftChecksRef.current = [...driftChecksRef.current.filter((c) => c.afterAssetCount !== afterAssetCount), check].sort((a, b) => a.afterAssetCount - b.afterAssetCount);
        return true;
      }
      if (recoveringRef.current || !check.passed) recoveryChecksRef.current = [...recoveryChecksRef.current, driftSummary(check)].slice(-24);
      if (!check.passed) {
        recoverStudy(driftFailures(check, device).join(" "));
        return false;
      }
      // Un control para reanudar no sustituye el control que ya validó el bloque conservado.
      if (!driftChecksRef.current.some((c) => c.afterAssetCount === afterAssetCount)) driftChecksRef.current.push(check);
      confirmedCountRef.current = Math.max(confirmedCountRef.current, afterAssetCount);
    } else {
      driftChecksRef.current = [...driftChecksRef.current, check].slice(-10);
      if (!check.passed) {
        calibrationFitRef.current = null;
        setNeedsCalibration(true);
        setError("La mirada perdió precisión. Recalibra antes de continuar.");
        setStage("results");
      }
    }
    setSession((previous) => previous ? recordDriftChecks(previous, [...driftChecksRef.current]) : previous);
    return check.passed;
  }, [session, device, study, recoverStudy]);

  async function startStudy(allowLimited = false) {
    if (!study || !session || studyBusy) return;
    if (allowLimited) {
      if (recoveryCountRef.current < 2 || !recoveryChecksRef.current.some((check) => !check.passed)) return;
      measurementLimitedRef.current = true;
      setMeasurementLimited(true);
    }
    if (!measurementLimitedRef.current && (needsCalibration || !calibrationFitRef.current || !session.verdict.pass)) return setError("Recalibra antes de iniciar: la medición no alcanzó la calidad necesaria.");
    if (!measurementLimitedRef.current && (window.innerWidth !== session.viewport.width || window.innerHeight !== session.viewport.height)) {
      return setError("La ventana cambió desde la calibración. Recalibra antes de iniciar.");
    }
    if (!study.preview && session.engineId !== "webeyetrack@0.0.2") {
      setError("La vista de prueba no puede enviar lecturas a un estudio real. Abre la liga sin el simulador.");
      return;
    }
    setStudyBusy(true);
    setError(null);
    let operationId = runIdRef.current;
    try {
      if (!recoveringRef.current) driftChecksRef.current = [];
      const resumeIndex = recoveringRef.current ? confirmedCountRef.current : 0;
      if (measurementLimitedRef.current) {
        if (!driftChecksRef.current.some((c) => c.afterAssetCount === resumeIndex)) {
          const last = recoveryChecksRef.current.filter((c) => c.afterAssetCount === resumeIndex).at(-1);
          driftChecksRef.current.push(last ? { ...last, targets: [] } : unmeasuredDriftCheck(resumeIndex));
          driftChecksRef.current.sort((a, b) => a.afterAssetCount - b.afterAssetCount);
        }
      } else if (!await runDriftCheck(resumeIndex)) return;
      const runId = runIdRef.current;
      operationId = runId;
      setStage("preparing");
      // No se inicia una sesión en la BD hasta que todas las imágenes estén listas.
      await Promise.all(study.assets.map((asset) => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`No se pudo cargar la pieza «${asset.title}». Vuelve a intentar.`));
        image.src = asset.url;
      })));
      if (runIdRef.current !== runId) return;
      if (!study.preview && !studySessionIdRef.current) {
        const deviceType = device === "laptop" ? "desktop" : device === "phone" ? "mobile" : "tablet";
        const response = await fetch(`/api/s/${study.token}/eye/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consent: true, protocol: "eye-v3", device: { deviceType, screenWidth: window.screen.width, screenHeight: window.screen.height } }),
        });
        const result = await response.json();
        if (!response.ok || !result.sessionId) throw new Error(result.message ?? "No se pudo iniciar la sesión.");
        studySessionIdRef.current = result.sessionId;
      }
      if (runIdRef.current !== runId) return;
      studyValidationsRef.current.set(calibrationEpochRef.current, session);
      if (!recoveringRef.current) observationsRef.current = [];
      recoveringRef.current = false;
      setNeedsCalibration(false);
      setStimulusIndex(resumeIndex);
      setStage("stimulus");
    } catch (cause) {
      if (operationId !== runIdRef.current) return;
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar el estudio.");
      setStage("results");
    } finally {
      setStudyBusy(false);
    }
  }

  const saveStudy = useCallback(async () => {
    if (!study || !session) return;
    setStage("saving");
    setError(null);
    engineRef.current?.stop();
    if (study.preview) {
      setStage("done");
      return;
    }
    if (!studySessionIdRef.current || session.engineId !== "webeyetrack@0.0.2") {
      setError("La sesión no tiene un motor real activo. Vuelve a abrir la liga.");
      return;
    }
    const validations = [...studyValidationsRef.current.values()];
    if (!validations.length) validations.push(session);
    const quality: EyeQuality = {
      engineId: session.engineId,
      measurementStatus: measurementLimitedRef.current ? "limited" : "validated",
      medianErrorDeg: validations.some((s) => s.summary.medianErrorDeg === null) ? null : Math.max(...validations.map((s) => s.summary.medianErrorDeg!)),
      coverage: Math.min(...validations.map((s) => s.summary.coverage)),
      fps: Math.min(...validations.map((s) => s.fps)),
      validRatio: Math.min(...validations.map((s) => s.validation.stream.validRatio)),
      passed: !measurementLimitedRef.current && validations.every((s) => s.verdict.pass),
      calibrationClicks: session.calibration.clicks,
      calibrationLayout: session.calibration.layout ?? "v2-corners-last",
      driftChecks: driftChecksRef.current.map(driftSummary),
      ...(recoveryCountRef.current ? { recovery: {
        interruptions: recoveryCountRef.current,
        recalibrations: recalibrationCountRef.current,
        repeatedAssetIds: [...repeatedAssetsRef.current],
        checks: recoveryChecksRef.current,
      } } : {}),
    };
    try {
      const response = await fetch(`/api/s/${study.token}/eye/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: studySessionIdRef.current, quality, observations: observationsRef.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudieron guardar las lecturas.");
      setStage("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar las lecturas.");
    }
  }, [study, session]);

  const continueAfterPiece = useCallback(async (next: number) => {
    if (!study) return;
    if (driftCheckpoints(study.assets.length).includes(next)) {
      if (!await runDriftCheck(next)) return;
    }
    if (next < study.assets.length) {
      setStimulusIndex(next);
      setStage("stimulus");
    } else {
      await saveStudy();
    }
  }, [study, runDriftCheck, saveStudy]);

  useEffect(() => {
    if (stage !== "stimulus" || !study) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let ticker: ReturnType<typeof setInterval> | undefined;
    const onInterrupted = () => {
      if (document.hidden) {
        recoverStudy("La prueba se pausó al cambiar de pestaña. Conservamos las imágenes ya validadas; revisa tu posición para continuar.");
      }
    };
    const onResize = () => {
      if (window.innerWidth === calibrationViewportRef.current.width && window.innerHeight === calibrationViewportRef.current.height) return;
      recoverStudy("La pantalla cambió de tamaño. Recalibra para continuar desde el último bloque validado.", true);
    };
    document.addEventListener("visibilitychange", onInterrupted);
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => {
      const image = stimulusImgRef.current;
      const rect = image?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) {
        recoverStudy("No se pudo mostrar la imagen completa. Conservamos el avance validado; vuelve a intentar.");
        return;
      }
      presentedAssetsRef.current.add(study.assets[stimulusIndex].id);
      const from = performance.now();
      const durationMs = study.durationSeconds * 1000;
      setRemaining(study.durationSeconds);
      ticker = setInterval(() => setRemaining(Math.max(0, Math.ceil((from + durationMs - performance.now()) / 1000))), 250);
      timeout = setTimeout(() => {
        if (cancelled) return;
        observationsRef.current.push(collectEyeObservation(study.assets[stimulusIndex].id, framesRef.current, from, performance.now(), rect));
        void continueAfterPiece(stimulusIndex + 1);
      }, durationMs);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", onInterrupted);
      window.removeEventListener("resize", onResize);
    };
  }, [stage, study, stimulusIndex, continueAfterPiece, recoverStudy]);

  // Cuenta regresiva antes de validar: el último clic de calibración ya pasó y no se pide ninguno más.
  useEffect(() => {
    if (stage !== "countdown") return;
    const tick = setInterval(() => setCountdown((c) => Math.max(c - 1, 0)), 1000);
    const go = setTimeout(() => void runValidation(), COUNTDOWN_S * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [stage, runValidation]);

  function downloadRecoveryDiagnostic() {
    if (!session) return;
    const report = { version: "eye-v3-measured-fixations", session, lastDriftCheck,
      recovery: { interruptions: recoveryCountRef.current, recalibrations: recalibrationCountRef.current,
        confirmedImages: confirmedCountRef.current, checks: recoveryChecksRef.current },
      measurementStatus: measurementLimitedRef.current ? "limited" : "validated" };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `eyetracking-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function changeDevice(next: DeviceType) {
    setDevice(next);
    setInches("");
    setReferenceConfirmed(false);
    setScreenFormat("auto");
    setDistanceCm(PRESETS[next].distanceCm);
  }

  async function copyJson() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(session, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles; usa «Descargar JSON» o copia el texto de abajo.");
    }
  }

  function downloadJson() {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = session.createdAt.replace(/[:.]/g, "-");
    a.href = url;
    a.download = `eyetracking-${session.participant}-${session.device}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const screenFields = (
    <>
            <Field label="Dispositivo">
              <select
                className="w-full rounded-md border border-control bg-background px-3.5 py-2.5 text-sm"
                value={device}
                onChange={(e) => changeDevice(e.target.value as DeviceType)}
              >
                {(Object.keys(PRESETS) as DeviceType[]).map((d) => (
                  <option key={d} value={d}>
                    {PRESETS[d].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cómo ajustar el tamaño de pantalla">
              <select className="w-full rounded-md border border-control bg-background px-3.5 py-2.5 text-sm" value={screenMeasurement} onChange={(e) => setScreenMeasurement(e.target.value as "reference-card" | "diagonal")}>
                <option value="reference-card">Usar una tarjeta (sin saber pulgadas)</option>
                <option value="diagonal">Conozco las pulgadas de mi pantalla</option>
              </select>
            </Field>
            {screenMeasurement === "reference-card" ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed">Coloca una tarjeta de tamaño bancario en vertical sobre la pantalla. Ajusta el dibujo hasta que coincida con sus bordes. No necesitas mostrarla a la cámara ni enviar sus datos.</p>
                <div className="grid grid-cols-1 justify-items-center" aria-hidden="true">
                  <div ref={referenceCardRef} className="flex items-center justify-center rounded-xl border-2 border-dashed border-control bg-background text-center text-sm text-muted" style={{ width: referenceWidth, maxWidth: "calc(100vw - 8px)", aspectRatio: "53.98 / 85.6" }}>
                    Tarjeta en vertical
                  </div>
                </div>
                <Field label="Ajustar tarjeta" hint="Usa el control hasta que el dibujo tenga el mismo tamaño que la tarjeta real.">
                  <input className="w-full" type="range" min="80" max={Math.max(80, Math.min(520, document.documentElement.clientWidth - 8))} step="1" value={referenceWidth} onChange={(e) => { setReferenceWidth(Number(e.target.value)); setReferenceConfirmed(false); }} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={referenceConfirmed} onChange={(e) => { setReferenceConfirmed(e.target.checked); setReferenceGeometry(screenGeometryKey()); setMeasuredReferenceWidth(referenceCardRef.current?.getBoundingClientRect().width ?? 0); }} />
                  El dibujo coincide con mi tarjeta
                </label>
              </div>
            ) : (
              <>
                <Field label="Tamaño de pantalla (pulgadas)" hint="Diagonal de la pantalla completa, no de la ventana.">
                  <Input type="number" inputMode="decimal" step="0.1" min="3" max="100" placeholder={PRESETS[device].inches} value={inches} onChange={(e) => setInches(e.target.value)} />
                </Field>
                <Field label="Formato de pantalla" hint="El modo automático usa la proporción de la pantalla completa.">
                  <select className="w-full rounded-md border border-control bg-background px-3.5 py-2.5 text-sm" value={screenFormat} onChange={(e) => setScreenFormat(e.target.value as ScreenFormat)}>
                    <option value="auto">Detectar formato de la pantalla</option>
                    <option value="16:9">Estándar 16:9</option>
                    <option value="16:10">Estándar 16:10</option>
                    <option value="4:3">Estándar 4:3</option>
                    <option value="21:9">Ultrawide 21:9</option>
                    <option value="32:9">Super ultrawide 32:9</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Distancia a los ojos (cm)" hint="Aproximada, con la postura de uso normal.">
              <Input type="number" inputMode="decimal" step="1" min="10" max="200" value={distanceCm} onChange={(e) => setDistanceCm(e.target.value)} />
            </Field>
    </>
  );
  const conditionFields = (
    <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Iluminación">
                <select
                  className="w-full rounded-md border border-control bg-background px-3.5 py-2.5 text-sm"
                  value={lighting}
                  onChange={(e) => setLighting(e.target.value as Lighting)}
                >
                  <option value="buena">Buena (luz frontal)</option>
                  <option value="media">Media</option>
                  <option value="mala">Mala (contraluz / oscuro)</option>
                </select>
              </Field>
              <Field label="Calibración">
                <select
                  className="w-full rounded-md border border-control bg-background px-3.5 py-2.5 text-sm"
                  value={passes}
                  onChange={(e) => setPasses(Number(e.target.value))}
                >
                  <option value={1}>Básica (9 puntos)</option>
                  <option value={2}>Con ajuste fino (18 puntos · recomendada)</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={glasses} onChange={(e) => setGlasses(e.target.checked)} className="size-4" />
              Usa lentes
            </label>
    </>
  );

  return (
    <>
      <div ref={videoParkingRef} />

      {stage === "setup" || stage === "loading" ? (
        study ? (
          <ParticipantScreen>
            <ScreenHeader
              icon="eye"
              eyebrow="Estudio de eye tracking"
              title={study.title}
              lead={`Calibra la cámara y mira ${study.assets.length} ${study.assets.length === 1 ? "pieza" : "piezas"} durante ${study.durationSeconds} segundos cada una. No necesitas crear una cuenta.`}
            />

            <Section title="Cómo funciona">
              <FactList
                items={[
                  { icon: "user", text: "Te acomodas frente a la cámara, con buena luz." },
                  { icon: "target", text: "Sigues unos puntos en la pantalla para calibrar." },
                  { icon: "image", text: `Miras ${study.assets.length === 1 ? "la pieza" : "las piezas"} sin hacer nada más.` },
                ]}
              />
            </Section>

            <Section icon="lock" title="Tu privacidad">
              <ReadingPanel>
                <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
                  <li>El video se procesa en este dispositivo y no se envía a NeuroFusion.</li>
                  <li>Con tu consentimiento se guardan únicamente coordenadas de mirada, tiempos y calidad de calibración.</li>
                  <li>El investigador consulta las lecturas y resultados agregados.</li>
                </ul>
                <details className="mt-3 text-sm text-muted">
                  <summary className="cursor-pointer font-medium text-heading">Detalles técnicos</summary>
                  <p className="mt-2">
                    Los modelos de MediaPipe se bajan de <code>cdn.jsdelivr.net</code> y <code>storage.googleapis.com</code>.
                  </p>
                </details>
              </ReadingPanel>
            </Section>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Section icon="device" title="Tu pantalla">
              <ReadingPanel>
                <div className="space-y-4">{screenFields}</div>
              </ReadingPanel>
            </Section>

            <Section icon="settings" title="Condiciones de la prueba">
              <ReadingPanel>
                <div className="space-y-4">{conditionFields}</div>
              </ReadingPanel>
            </Section>

            <div className="space-y-4">
              <ConsentCheck checked={consent} onChange={setConsent}>
                Acepto usar la cámara durante la prueba y que se guarden mis coordenadas de mirada, tiempos y métricas de calidad. El video no se guarda.
              </ConsentCheck>
              <Button size="lg" onClick={start} disabled={stage === "loading"} className="w-full">
                {stage === "loading" ? "Cargando cámara y modelos…" : "Iniciar cámara y cargar modelos"}
              </Button>
              {stage === "loading" ? (
                <p className="text-sm text-muted" role="status">La primera vez descarga varios MB de modelos; puede tardar hasta 45 s.</p>
              ) : null}
            </div>
          </ParticipantScreen>
        ) : (
        <div className="mx-auto max-w-xl space-y-5 px-4 py-8">
          <header className="space-y-1">
            <p className="text-xs font-semibold text-muted">Laboratorio · interno</p>
            <h1 className="text-3xl font-bold">Prueba de eye tracking con webcam</h1>
            <p className="text-sm text-muted">
              Mide qué tan preciso es WebEyeTrack en este dispositivo. Calibración recomendada de 18 puntos en dos etapas y validación independiente de 8.
            </p>
          </header>

          <Alert tone="info">
            <p>
              El video se procesa en este dispositivo y no se envía a NeuroFusion. El resultado solo se guarda si lo descargas. Los modelos de MediaPipe se bajan de <code>cdn.jsdelivr.net</code> y{" "}
              <code>storage.googleapis.com</code>.
            </p>
          </Alert>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Card className="space-y-4">
            <Field label="Código de la persona" hint="Por ejemplo P01. No pongas nombres ni correos.">
              <Input value={participant} onChange={(e) => setParticipant(e.target.value)} maxLength={24} autoComplete="off" />
            </Field>

            {screenFields}

            {conditionFields}

            <Button onClick={start} disabled={stage === "loading"} className="w-full">
              {stage === "loading" ? "Cargando cámara y modelos…" : "Iniciar cámara y cargar modelos"}
            </Button>
            {stage === "loading" ? (
              <p className="text-xs text-muted">La primera vez descarga varios MB de modelos; puede tardar hasta 45 s.</p>
            ) : null}
          </Card>
        </div>
        )
      ) : null}

      {stage === "position" ? (
        <ParticipantScreen>
          <ScreenHeader
            icon="user"
            title="Acomódate frente a la cámara"
            lead="Tu cara debe verse completa y centrada, con luz de frente."
          />
          <ul className="list-disc space-y-2 pl-6 text-base leading-relaxed">
            <li>Apoya el dispositivo: no lo sostengas en el aire.</li>
            <li>No lo muevas ni lo gires durante toda la prueba.</li>
            <li>Mantén la cabeza lo más quieta que puedas.</li>
          </ul>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <p role="status" className="flex flex-wrap items-center gap-2 text-base">
            <StatusBadge tone={live.faceOk ? "success" : "warning"}>Cara detectada: {live.faceOk ? "sí" : "no"}</StatusBadge>
            <span className="text-sm text-muted">Lecturas por segundo: {live.fps}</span>
          </p>
          {live.faceOk && !live.gazeOk ? <p role="status" className="text-sm text-muted">Vemos tu rostro. Mira de frente con los ojos abiertos y coloca la cámara a la altura de los ojos para detectar tu mirada.</p> : null}
          <div ref={videoPreviewRef} data-testid="camera-preview" />
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={startCalibration} disabled={!live.gazeOk}>
              Comenzar calibración
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setStage("free")} disabled={!live.gazeOk}>
              Ver mi punto de mirada
            </Button>
            <Button variant="ghost" onClick={() => { teardown(); setLive({ fps: 0, faceOk: false, gazeOk: false }); setStage("setup"); }}>Volver a iniciar cámara</Button>
          </div>
        </ParticipantScreen>
      ) : null}

      {stage === "recovery" && study ? (
        <ParticipantScreen>
          <ScreenHeader icon="refresh" title="Hagamos un ajuste rápido" />
          {error ? <Alert tone="warning">{error}</Alert> : null}
          <Callout icon="check" title="Tu avance está guardado">
            <p>
              Conservamos {resumeCount ?? 0} de {study.assets.length} imágenes validadas en esta sesión.
              Continuarás desde la imagen {(resumeCount ?? 0) + 1}.
            </p>
          </Callout>
          <Section title="Qué hacer">
            <p className="text-base leading-relaxed">
              Centra tu cara como al principio y apoya el dispositivo. Mira los 3 puntos del control; tarda entre 6 y 11 segundos.
              Repetiremos sólo las imágenes del bloque que quedó sin validar.
            </p>
            {needsCalibration ? <p className="text-base leading-relaxed">Necesitamos recalibrar con el tamaño actual de la ventana. Las imágenes validadas se conservan.</p> : null}
          </Section>
          {lastDriftCheck ? <p className="text-sm text-muted">
            Error mediano: {lastDriftCheck.medianErrorDeg !== null ? `${lastDriftCheck.medianErrorDeg.toFixed(1)}°` : "sin medición"} · Lecturas/s: {lastDriftCheck.fps.toFixed(0)} · Detección durante fijación: {Math.round(lastDriftCheck.validRatio * 100)} %
          </p> : null}
          <div ref={videoPreviewRef} data-testid="camera-preview" />
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => void startStudy()} disabled={studyBusy || needsCalibration}>Revisar mirada y continuar</Button>
            <Button size="lg" variant="secondary" onClick={startCalibration} disabled={studyBusy}>Recalibrar</Button>
          </div>
          {limitedReady ? <Callout icon="alert" title="Si el ajuste sigue fallando">
            <p>Puedes terminar. Tu participación quedará marcada con precisión limitada y sus miradas no se incluirán en los mapas válidos.</p>
            <Button className="mt-3" variant="secondary" onClick={() => void startStudy(true)} disabled={studyBusy}>Continuar con precisión limitada</Button>
          </Callout> : null}
          {diagnosticsEnabled ? <Button variant="ghost" onClick={downloadRecoveryDiagnostic}>Descargar diagnóstico</Button> : null}
          <p className="text-sm text-muted">El avance se conserva mientras mantengas abierta esta sesión.</p>
        </ParticipantScreen>
      ) : null}

      {stage === "calibration" && calibPoints[calibIndex] ? (
        <div className="fixed inset-0 z-50 touch-manipulation bg-background select-none">
          <p className="absolute top-4 right-0 left-0 px-4 text-center text-sm text-muted" role="status">
            {reviewingCalibration ? "Revisión selectiva" : calibIndex < 9 ? "Calibración base" : "Ajuste fino"} · Punto {calibIndex + 1} de {calibPoints.length}. Mira el punto y, cuando se ponga verde, tócalo o haz clic sin
            dejar de mirarlo. Mantén la mirada hasta que cambie de posición.
            {dotSampling ? " Registrando mirada… sigue mirando el punto." : ""}
          </p>
          {error ? <p role="alert" className="absolute right-4 bottom-4 left-4 text-center text-sm text-danger">{error}</p> : null}
          <button
            type="button"
            aria-label={`Punto de calibración ${calibIndex + 1}`}
            data-calib-dot={dotActive ? "" : undefined}
            disabled={!dotActive}
            onClick={onCalibrationDot}
            className={`absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 transition-colors ${
              dotActive || dotSampling ? "border-heading bg-primary" : "border-border bg-transparent"
            }`}
            style={{ left: calibPoints[calibIndex].x, top: calibPoints[calibIndex].y }}
          />
          <button type="button" aria-label="Ajustar posición" title="Ajustar posición" className="absolute top-1 right-1 z-10 size-6 rounded border border-border text-muted" onClick={() => {
            runIdRef.current++;
            calibrationFitRef.current = null;
            setNeedsCalibration(true);
            setStage("position");
          }}>×</button>
        </div>
      ) : null}

      {stage === "countdown" ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center select-none">
          <p className="text-lg font-medium text-heading">Calibración lista</p>
          <p className="max-w-sm text-sm text-muted">
            Ahora solo mira cada punto que aparezca, <strong>sin tocar la pantalla</strong>. Son 8 puntos, unos 20 segundos.
          </p>
          <p className="font-display text-5xl font-semibold text-heading" role="status">
            {Math.max(countdown, 0)}
          </p>
        </div>
      ) : null}

      {(stage === "validation" || stage === "drift") && valTargets[valIndex] ? (
        <div className="fixed inset-0 z-50 bg-background select-none">
          <p className="absolute top-4 right-0 left-0 px-4 text-center text-xs text-muted" role="status">
            {stage === "drift" ? `Control de mirada ${valIndex + 1} de ${valTargets.length}. Solo mira el punto.` : `Objetivo ${valIndex + 1} de ${valTargets.length}. Solo mira el punto.`}
          </p>
          <div
            aria-hidden="true"
            data-testid={stage === "drift" ? "drift-target" : "validation-target"}
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-heading bg-primary"
            style={{ left: valTargets[valIndex].x, top: valTargets[valIndex].y }}
          />
        </div>
      ) : null}

      {stage === "free" ? (
        <div className="fixed inset-0 z-50 bg-background select-none">
          <p className="absolute top-4 right-0 left-0 px-4 text-center text-sm text-muted">
            El punto morado es la estimación de tu mirada. Si salta mucho o se desvía, recalibra.
          </p>
          <div
            ref={dotRef}
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 size-[30px] rounded-full bg-neuro opacity-0"
          />
          <div className="absolute right-0 bottom-6 left-0 flex justify-center">
            <Button variant="secondary" onClick={() => setStage(session ? "results" : "position")}>
              Salir
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "results" && session && study ? (
        <ParticipantScreen>
          {session.verdict.pass && !needsCalibration ? (
            <ScreenHeader
              icon="check"
              title="Calibración terminada"
              lead="La precisión alcanzó el criterio de esta prueba. Ya puedes mirar las piezas."
            />
          ) : (
            <ScreenHeader
              icon="alert"
              title="Calibración terminada"
              lead="La calibración tuvo precisión baja. Repite la calibración antes de mirar las piezas."
            />
          )}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => void startStudy()} disabled={studyBusy || needsCalibration || !session.verdict.pass}>{studyBusy ? "Preparando piezas…" : resumeCount !== null ? `Continuar desde imagen ${resumeCount + 1}` : "Comenzar presentación"}</Button>
              <Button size="lg" variant="secondary" onClick={startCalibration} disabled={studyBusy}>Recalibrar</Button>
            </div>
            {resumeCount !== null ? <p className="text-base text-muted">Conservamos {resumeCount} imágenes ya validadas. Continuaremos desde ese punto.</p> : null}
            {study.preview ? <p className="text-sm text-muted">Vista previa: no se guardarán datos.</p> : null}
          </div>
        </ParticipantScreen>
      ) : null}

      {stage === "results" && session && !study ? (
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
          <header className="space-y-1">
            <p className="text-xs font-semibold text-muted">
              {session.participant} · {session.device} · {session.engineId}
            </p>
            <h1 className="text-3xl font-bold">Resultados de la validación</h1>
          </header>

          {error ? <Alert tone="error">{error}</Alert> : null}
          <ResultsView session={session} />

          <Card className="space-y-3">
            <h2 className="text-xl font-semibold">Guardar y seguir</h2>
            <div className="flex flex-wrap gap-3">
              <Button onClick={downloadJson}>Descargar JSON</Button>
              <Button variant="secondary" onClick={copyJson}>
                {copied ? "Copiado" : "Copiar JSON"}
              </Button>
              <Button variant="secondary" onClick={() => void runValidation()}>
                Repetir validación
              </Button>
              <Button variant="secondary" disabled={needsCalibration} onClick={async () => {
                if (await runDriftCheck(0)) setStage("results");
              }}>Comprobar deriva</Button>
              <Button variant="secondary" onClick={startCalibration}>
                Recalibrar
              </Button>
              <Button variant="ghost" onClick={() => setStage("free")}>
                Ver mi punto de mirada
              </Button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">Ver JSON</summary>
              <textarea
                readOnly
                className="mt-2 h-48 w-full rounded-md border border-control bg-background p-2 font-mono"
                value={JSON.stringify(session, null, 2)}
              />
            </details>
          </Card>
        </div>
      ) : null}

      {stage === "stimulus" && study?.assets[stimulusIndex] ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-4 py-3 text-center">
          <p className="font-display text-sm font-semibold text-muted">Pieza {stimulusIndex + 1} de {study.assets.length} · {remaining} s</p>
          {measurementLimited ? <p className="text-xs text-muted">Continuando con precisión limitada.</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage; necesitamos el rectángulo exacto mostrado */}
          <img
            ref={stimulusImgRef}
            src={study.assets[stimulusIndex].url}
            alt={study.assets[stimulusIndex].title}
            className="max-h-[calc(100dvh-5rem)] max-w-full object-contain"
          />
        </div>
      ) : null}

      {stage === "preparing" ? <StatusScreen icon="refresh" title="Preparando las imágenes…" role="status" /> : null}

      {stage === "saving" ? (
        error ? (
          <StatusScreen
            icon="alert"
            title="Guardando tu participación"
            role="alert"
            actions={<Button size="lg" onClick={() => void saveStudy()}>Reintentar guardado</Button>}
          >
            <Alert tone="error">{error}</Alert>
          </StatusScreen>
        ) : (
          <StatusScreen icon="refresh" title="Guardando tu participación" role="status">
            <p className="text-muted">Espera un momento…</p>
          </StatusScreen>
        )
      ) : null}

      {stage === "done" ? (
        <StatusScreen icon="check" title="Gracias por participar">
          <p>{study?.preview ? "Esta vista previa no guardó datos." : "Tu sesión de mirada se guardó correctamente."}</p>
        </StatusScreen>
      ) : null}
    </>
  );
}
