"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  EngineError,
  checkCdnReachable,
  checkModelAssets,
  createWebEyeTrackEngine,
  requestCamera,
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
import { buildDriftCheck, driftCheckpoints, driftSummary, driftTargets, type DriftCheck } from "./drift";
import { screenWidthCm, type ScreenFormat } from "./screen";

type Stage = "setup" | "loading" | "position" | "calibration" | "countdown" | "validation" | "drift" | "preparing" | "results" | "free" | "stimulus" | "saving" | "done";

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
  const [screenFormat, setScreenFormat] = useState<ScreenFormat>("auto");
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
  const [live, setLive] = useState({ fps: 0, faceOk: false });
  const [session, setSession] = useState<ExportedSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [consent, setConsent] = useState(false);
  const [stimulusIndex, setStimulusIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [studyBusy, setStudyBusy] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
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
  const calibrationViewportRef = useRef({ width: 0, height: 0 });
  const readyMsRef = useRef(0);
  const calibStartRef = useRef(0);
  const calibClicksRef = useRef(0);
  const calibDurationRef = useRef(0);
  const lastClickRef = useRef(0);
  const runIdRef = useRef(0);

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
    const interrupt = () => {
      runIdRef.current++;
      calibrationFitRef.current = null;
      setNeedsCalibration(true);
      setError("La prueba se interrumpió o cambió la ventana. Repite la calibración sin cambiar de pestaña ni tamaño.");
      setStage("position");
    };
    const visibility = () => { if (document.hidden) interrupt(); };
    window.addEventListener("resize", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("resize", interrupt);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stage]);

  // Indicadores en vivo (sin re-renderizar a la frecuencia de la cámara).
  useEffect(() => {
    if (stage !== "position") return;
    const id = setInterval(() => {
      const now = performance.now();
      const recent = framesRef.current.filter((f) => f.t > now - 1000);
      setLive({ fps: recent.length, faceOk: recent.some((f) => f.x !== null) });
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
    const geometryOk = Number.isFinite(screenWidthCm(Number(inches), screenFormat, window.screen.width, window.screen.height))
      && Number.isFinite(Number(distanceCm)) && Number(distanceCm) >= 10 && Number(distanceCm) <= 200;
    if (!study && !participant.trim()) return setError("Escribe un código para la persona (por ejemplo P01). No uses nombres.");
    if (study && !consent) return setError("Debes aceptar el uso de la cámara y el almacenamiento de coordenadas de mirada para participar.");
    if (!geometryOk) return setError("Indica una diagonal entre 3 y 100 pulgadas y una distancia entre 10 y 200 cm.");

    setStage("loading");
    try {
      // `?engine=fake` usa un simulador (puntero como mirada) para probar el flujo sin cámara ni modelos.
      const fake = new URLSearchParams(window.location.search).get("engine") === "fake";
      if (study && !study.preview && fake) {
        throw new EngineError("El simulador sólo está disponible en la vista previa del estudio.", "model-missing");
      }
      if (!fake) {
        await requestCamera();
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
    runIdRef.current++;
    calibrationFitRef.current = null;
    calibrationPairsRef.current = [];
    calibrationReviewDoneRef.current = false;
    calibrationAttemptsRef.current = 0;
    relocatedPointsRef.current = [];
    reviewedPointsRef.current = [];
    driftChecksRef.current = [];
    observationsRef.current = [];
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
    driftChecksRef.current = [];

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
        geometry: { screenWidthPx: window.screen.width, screenWidthCm: screenWidthCm(Number(inches), screenFormat, window.screen.width, window.screen.height), distanceCm: Number(distanceCm), diagonalInches: Number(inches), screenFormat },
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
  }, [participant, device, glasses, lighting, inches, screenFormat, distanceCm, passes]);

  const runDriftCheck = useCallback(async (afterAssetCount: number): Promise<boolean | null> => {
    if (!session || !calibrationFitRef.current) return false;
    const runId = ++runIdRef.current;
    const { width, height } = session.viewport;
    if (window.innerWidth !== width || window.innerHeight !== height) {
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
    const startedAt = performance.now();
    const results: TargetResult[] = [];
    for (let i = 0; i < targets.length; i++) {
      setValIndex(i);
      const from = performance.now();
      await sleep(SETTLE_MS + 1000);
      if (runIdRef.current !== runId) return null;
      results.push(evaluateTarget(targets[i], framesRef.current, from + SETTLE_MS, from + SETTLE_MS + 1000));
    }
    const check = buildDriftCheck(afterAssetCount, results,
      frameStats(framesRef.current, startedAt, performance.now()), session.geometry, device);
    driftChecksRef.current = [...driftChecksRef.current, check].slice(-10);
    setSession((previous) => previous ? recordDriftChecks(previous, [...driftChecksRef.current]) : previous);
    if (!check.passed) {
      observationsRef.current = [];
      calibrationFitRef.current = null;
      setNeedsCalibration(true);
      setError("La mirada perdió precisión. Recalibra antes de continuar; la presentación deberá empezar de nuevo.");
      setStage("results");
    }
    return check.passed;
  }, [session, device]);

  async function startStudy() {
    if (!study || !session || studyBusy) return;
    if (needsCalibration || !calibrationFitRef.current || !session.verdict.pass) return setError("Recalibra antes de iniciar: la medición no alcanzó la calidad necesaria.");
    if (window.innerWidth !== session.viewport.width || window.innerHeight !== session.viewport.height) {
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
      driftChecksRef.current = [];
      if (!await runDriftCheck(0)) return;
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
          body: JSON.stringify({ consent: true, protocol: "eye-v2", device: { deviceType, screenWidth: window.screen.width, screenHeight: window.screen.height } }),
        });
        const result = await response.json();
        if (!response.ok || !result.sessionId) throw new Error(result.message ?? "No se pudo iniciar la sesión.");
        studySessionIdRef.current = result.sessionId;
      }
      if (runIdRef.current !== runId) return;
      observationsRef.current = [];
      setStimulusIndex(0);
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
    const quality: EyeQuality = {
      engineId: session.engineId,
      medianErrorDeg: session.summary.medianErrorDeg,
      coverage: session.summary.coverage,
      fps: session.fps,
      validRatio: session.validation.stream.validRatio,
      passed: session.verdict.pass,
      calibrationClicks: session.calibration.clicks,
      calibrationLayout: session.calibration.layout ?? "v2-corners-last",
      driftChecks: driftChecksRef.current.map(driftSummary),
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
        runIdRef.current++;
        calibrationFitRef.current = null;
        setNeedsCalibration(true);
        setError("La prueba se interrumpió al cambiar de pestaña. Vuelve a iniciar la presentación de piezas.");
        setStage("results");
      }
    };
    const onResize = () => {
      runIdRef.current++;
      calibrationFitRef.current = null;
      setNeedsCalibration(true);
      setError("La pantalla cambió de tamaño u orientación. Repite la presentación sin mover el dispositivo.");
      setStage("results");
    };
    document.addEventListener("visibilitychange", onInterrupted);
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => {
      const image = stimulusImgRef.current;
      const rect = image?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) {
        setError("No se pudo mostrar la imagen completa. Vuelve a intentar.");
        setStage("results");
        return;
      }
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
  }, [stage, study, stimulusIndex, continueAfterPiece]);

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

  function changeDevice(next: DeviceType) {
    setDevice(next);
    setInches("");
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

  const showPreview = stage === "position";

  return (
    <>
      {/* El video debe seguir montado y “visible” para el navegador (iOS no decodifica con display:none). */}
      <video
        ref={videoRef}
        id="webeyetrack-video"
        autoPlay
        playsInline
        muted
        aria-hidden={!showPreview}
        className={
          showPreview
            ? "mx-auto mb-4 aspect-4/3 w-60 -scale-x-100 rounded-md border border-border bg-black object-cover"
            : "pointer-events-none fixed top-0 left-0 size-px opacity-0"
        }
      />

      {stage === "setup" || stage === "loading" ? (
        <div className="mx-auto max-w-xl space-y-5 px-4 py-8">
          <header className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{study ? "Estudio visual" : "Laboratorio · interno"}</p>
            <h1 className="text-2xl font-semibold">{study ? study.title : "Prueba de eye tracking con webcam"}</h1>
            <p className="text-sm text-muted">
              {study
                ? `Calibra la cámara y mira ${study.assets.length} ${study.assets.length === 1 ? "pieza" : "piezas"} durante ${study.durationSeconds} segundos cada una. No necesitas crear una cuenta.`
                : "Mide qué tan preciso es WebEyeTrack en este dispositivo. Calibración recomendada de 18 puntos en dos etapas y validación independiente de 8."}
            </p>
          </header>

          <Alert tone="info">
            <p>
              El video se procesa en este dispositivo y no se envía a NeuroFusion. {study
                ? "Con tu consentimiento, se guardan únicamente coordenadas de mirada, tiempos y calidad de calibración; el investigador podrá consultar las lecturas y resultados agregados."
                : "El resultado solo se guarda si lo descargas."} Los modelos de MediaPipe se bajan de <code>cdn.jsdelivr.net</code> y{" "}
              <code>storage.googleapis.com</code>.
            </p>
          </Alert>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Card className="space-y-4">
            {!study ? (
              <Field label="Código de la persona" hint="Por ejemplo P01. No pongas nombres ni correos.">
                <Input value={participant} onChange={(e) => setParticipant(e.target.value)} maxLength={24} autoComplete="off" />
              </Field>
            ) : null}

            <Field label="Dispositivo">
              <select
                className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamaño de pantalla (pulgadas)" hint="Diagonal del monitor que estás usando, por ejemplo 27 o 34. No el tamaño de la ventana.">
                <Input type="number" inputMode="decimal" step="0.1" min="3" max="100" placeholder={PRESETS[device].inches} value={inches} onChange={(e) => setInches(e.target.value)} />
              </Field>
              <Field label="Distancia a los ojos (cm)" hint="Aproximada, con la postura de uso normal.">
                <Input type="number" inputMode="decimal" step="1" min="10" value={distanceCm} onChange={(e) => setDistanceCm(e.target.value)} />
              </Field>
            </div>

            <Field label="Formato de pantalla" hint="Selecciona ultrawide si corresponde. El modo automático usa la proporción de la pantalla completa.">
              <select className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm" value={screenFormat} onChange={(e) => setScreenFormat(e.target.value as ScreenFormat)}>
                <option value="auto">Detectar formato de la pantalla</option>
                <option value="16:9">Estándar 16:9</option>
                <option value="16:10">Estándar 16:10</option>
                <option value="4:3">Estándar 4:3</option>
                <option value="21:9">Ultrawide 21:9</option>
                <option value="32:9">Super ultrawide 32:9</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Iluminación">
                <select
                  className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
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
                  className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
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

            {study ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4" />
                Acepto usar la cámara durante la prueba y que se guarden mis coordenadas de mirada, tiempos y métricas de calidad. El video no se guarda.
              </label>
            ) : null}

            <Button onClick={start} disabled={stage === "loading"} className="w-full">
              {stage === "loading" ? "Cargando cámara y modelos…" : "Iniciar cámara y cargar modelos"}
            </Button>
            {stage === "loading" ? (
              <p className="text-xs text-muted">La primera vez descarga varios MB de modelos; puede tardar hasta 45 s.</p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {stage === "position" ? (
        <div className="mx-auto max-w-xl space-y-4 px-4 py-8 text-center">
          <h1 className="text-xl font-semibold">Acomódate frente a la cámara</h1>
          <p className="text-sm text-muted">
            Tu cara debe verse completa y centrada, con luz de frente. Apoya el dispositivo (no lo sostengas en el aire) y no
            lo muevas ni lo gires durante toda la prueba. Mantén la cabeza lo más quieta que puedas.
          </p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm" role="status">
            Cara detectada: <strong>{live.faceOk ? "sí" : "no"}</strong> · lecturas/s: <strong>{live.fps}</strong>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={startCalibration} disabled={!live.faceOk}>
              Comenzar calibración
            </Button>
            <Button variant="secondary" onClick={() => setStage("free")} disabled={!live.faceOk}>
              Ver mi punto de mirada
            </Button>
          </div>
        </div>
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

      {stage === "results" && session ? (
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
          <header className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {session.participant} · {session.device} · {session.engineId}
            </p>
            <h1 className="text-2xl font-semibold">{study ? "Calibración terminada" : "Resultados de la validación"}</h1>
          </header>

          {error ? <Alert tone="error">{error}</Alert> : null}
          {study ? (
            <Card className="space-y-4">
              <p className="text-sm">
                {session.verdict.pass && !needsCalibration
                  ? "La precisión alcanzó el criterio de esta prueba. Ya puedes mirar las piezas."
                  : "La calibración tuvo precisión baja. Repite la calibración antes de mirar las piezas."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void startStudy()} disabled={studyBusy || needsCalibration || !session.verdict.pass}>{studyBusy ? "Preparando piezas…" : "Comenzar presentación"}</Button>
                <Button variant="secondary" onClick={startCalibration} disabled={studyBusy}>Recalibrar</Button>
              </div>
              {study.preview ? <p className="text-xs text-muted">Vista previa: no se guardarán datos.</p> : null}
            </Card>
          ) : (
            <ResultsView session={session} />
          )}

          {!study ? <Card className="space-y-3">
            <h2 className="text-base font-semibold">Guardar y seguir</h2>
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
                className="mt-2 h-48 w-full rounded-md border border-border bg-background p-2 font-mono"
                value={JSON.stringify(session, null, 2)}
              />
            </details>
          </Card> : null}
        </div>
      ) : null}

      {stage === "stimulus" && study?.assets[stimulusIndex] ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-4 py-3 text-center">
          <p className="text-sm text-muted">Pieza {stimulusIndex + 1} de {study.assets.length} · {remaining} s</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage; necesitamos el rectángulo exacto mostrado */}
          <img
            ref={stimulusImgRef}
            src={study.assets[stimulusIndex].url}
            alt={study.assets[stimulusIndex].title}
            className="max-h-[calc(100dvh-5rem)] max-w-full object-contain"
          />
        </div>
      ) : null}

      {stage === "preparing" ? <div className="px-6 py-16 text-center" role="status">Preparando las imágenes…</div> : null}

      {stage === "saving" ? (
        <div className="mx-auto max-w-md space-y-4 px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Guardando tu participación</h1>
          {error ? <Alert tone="error">{error}</Alert> : <p className="text-sm text-muted">Espera un momento…</p>}
          {error ? <Button onClick={() => void saveStudy()}>Reintentar guardado</Button> : null}
        </div>
      ) : null}

      {stage === "done" ? (
        <div className="mx-auto max-w-md space-y-3 px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold">Gracias por participar</h1>
          <p className="text-sm text-muted">{study?.preview ? "Esta vista previa no guardó datos." : "Tu sesión de mirada se guardó correctamente."}</p>
        </div>
      ) : null}
    </>
  );
}
