"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ConsentCheck,
  FactList,
  ParticipantScreen,
  ScreenHeader,
  Section,
  StatusScreen,
} from "@/components/participant";
import {
  applyCalibration,
  assessFixation,
  finalizeCalibration,
  refinementGrid,
  fixationWindowMs,
  type CalibrationFit,
  type CalibrationPair,
} from "@/lab/eyetracking/calibration";
import {
  buildDriftCheck,
  driftFailures,
  driftFrameStats,
  driftSummary,
  driftTargets,
  type DriftSummary,
} from "@/lab/eyetracking/drift";
import {
  checkCdnReachable,
  checkModelAssets,
  createWebEyeTrackEngine,
  type GazeEngine,
} from "@/lab/eyetracking/engine";
import {
  FACE_LANDMARKER_MODEL,
  MOBILE_VISION_WASM,
} from "@/lab/eyetracking/face-detector-config";
import {
  calibrationGrid,
  evaluateTarget,
  frameStats,
  summarize,
  validationTargets,
  verdict,
  type DeviceType,
  type GazeFrame,
  type Point,
  type TargetResult,
} from "@/lab/eyetracking/metrics";
import type { EyeParticipantStudy } from "../eye/participant.server";
import type { EyeQuality } from "../eye/schema";
import { VideoNeuroRunner } from "./VideoNeuroRunner";
import {
  observeLighting,
  LIGHTING_MESSAGES,
  type LightingStatus,
} from "@/lab/eyetracking/lighting";
import { screenWidthFromReference } from "@/lab/eyetracking/screen";
import { Field, Input } from "@/components/ui/field";
import type { LiveVideoReading } from "./collector";
import type { VideoObservation } from "./schema";

type Stage =
  | "setup"
  | "loading"
  | "calibration"
  | "validation"
  | "drift"
  | "drift-retry"
  | "stimulus"
  | "saving"
  | "done";

const CALIB_SETTLE_MS = 1000;
const VAL_MEASURE_MS = 1400;
const DRIFT_MEASURE_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function guessDevice(): DeviceType {
  if (typeof window === "undefined") return "laptop";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "laptop";
  return Math.min(window.screen.width, window.screen.height) < 600
    ? "phone"
    : "tablet";
}

function estimateDistanceCm(device: DeviceType): number {
  if (device === "phone") return 32;
  if (device === "tablet") return 42;
  return 55;
}

export function VideoStudyRunner({
  token,
  study,
  preview,
}: {
  token: string;
  study: EyeParticipantStudy;
  preview: boolean;
}) {
  const videoStimulus = study.video;
  const [stage, setStage] = useState<Stage>("setup");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("Preparando cámara y modelos…");
  const [device] = useState<DeviceType>(guessDevice);
  const [referenceWidth, setReferenceWidth] = useState(180);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [distanceCm, setDistanceCm] = useState(() =>
    estimateDistanceCm(guessDevice()),
  );
  const geometryRef = useRef({ width: 0, height: 0 });
  const stopLightingRef = useRef<(() => void) | null>(null);
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  const [calibIndex, setCalibIndex] = useState(0);
  const [samplingDot, setSamplingDot] = useState(false);
  const [valTargets, setValTargets] = useState<Point[]>([]);
  const [valIndex, setValIndex] = useState(0);

  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<GazeEngine | null>(null);
  const faceLandmarkerRef = useRef<{
    detectForVideo: (
      video: HTMLVideoElement,
      timestampMs: number,
    ) => {
      faceBlendshapes?: Array<{
        categories: Array<{ categoryName: string; score: number }>;
      }>;
      facialTransformationMatrixes?: Array<{ data: ArrayLike<number> }>;
    };
    close: () => void;
  } | null>(null);
  const rawFramesRef = useRef<GazeFrame[]>([]);
  const calibratedFramesRef = useRef<GazeFrame[]>([]);
  const calibrationFitRef = useRef<CalibrationFit | null>(null);
  const calibrationPairsRef = useRef<CalibrationPair[]>([]);
  const qualityRef = useRef<EyeQuality | null>(null);
  const initialDriftRef = useRef<DriftSummary | null>(null);
  const pendingObservationRef = useRef<VideoObservation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const faceRecoveryAttemptRef = useRef(0);

  const latestReadingRef = useRef<LiveVideoReading | null>(null);

  const cleanup = useCallback(() => {
    runIdRef.current++;
    stopLightingRef.current?.();
    stopLightingRef.current = null;
    engineRef.current?.stop();
    engineRef.current = null;
    try {
      faceLandmarkerRef.current?.close();
    } catch {
      // ignora errores al cerrar el detector facial
    }
    faceLandmarkerRef.current = null;
    webcamVideoRef.current?.remove();
    webcamVideoRef.current = null;
    latestReadingRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Muestreo de blendshapes faciales a ~10 Hz durante el estímulo de video
  useEffect(() => {
    if (stage !== "stimulus" || !videoStimulus?.facialCoding) return;
    let lastTs = -1;
    const timer = setInterval(() => {
      const detector = faceLandmarkerRef.current;
      const vid = webcamVideoRef.current;
      if (!detector || !vid || vid.readyState < 2) return;
      const now = Math.round(performance.now());
      if (now <= lastTs) return;
      lastTs = now;
      try {
        const res = detector.detectForVideo(vid, now);
        const categories = res.faceBlendshapes?.[0]?.categories;
        const matrixData = res.facialTransformationMatrixes?.[0]?.data ?? null;
        if (categories?.length) {
          const map: Record<string, number> = {};
          for (const c of categories) {
            map[c.categoryName] = c.score;
          }
          latestReadingRef.current = {
            x: latestReadingRef.current?.x ?? null,
            y: latestReadingRef.current?.y ?? null,
            blendshapes: map,
            gazeCapturedAt: latestReadingRef.current?.gazeCapturedAt,
            facialCapturedAt: now,
            matrixData,
          };
        }
      } catch {
        // El detector GPU puede inicializar y fallar después: invalidar la lectura y usar CPU.
        latestReadingRef.current = {
          ...latestReadingRef.current,
          x: latestReadingRef.current?.x ?? null,
          y: latestReadingRef.current?.y ?? null,
          blendshapes: null,
          matrixData: null,
          facialCapturedAt: undefined,
        };
        faceLandmarkerRef.current = null;
        try {
          detector.close();
        } catch {
          /* liberar el detector fallido */
        }
        if (faceRecoveryAttemptRef.current++ >= 1) {
          cleanup();
          setError(
            "La lectura facial se interrumpió. Vuelve a iniciar la cámara.",
          );
          setStage("setup");
          return;
        }
        const run = runIdRef.current;
        void import("@mediapipe/tasks-vision")
          .then(async ({ FaceLandmarker, FilesetResolver }) => {
            const fileset =
              await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
            const cpu = await FaceLandmarker.createFromOptions(fileset, {
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
              baseOptions: {
                modelAssetPath: FACE_LANDMARKER_MODEL,
                delegate: "CPU",
              },
            });
            if (run !== runIdRef.current) cpu.close();
            else faceLandmarkerRef.current = cpu;
          })
          .catch(() => {
            if (run === runIdRef.current) {
              cleanup();
              setError(
                "No se pudo recuperar la lectura facial. Vuelve a iniciar la cámara.",
              );
              setStage("setup");
            }
          });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [stage, videoStimulus?.facialCoding, cleanup]);

  useEffect(() => {
    if (!["calibration", "validation", "drift", "stimulus"].includes(stage))
      return;
    const interrupt = () => {
      if (
        !document.hidden &&
        window.innerWidth === geometryRef.current.width &&
        window.innerHeight === geometryRef.current.height
      )
        return;
      cleanup();
      setError(
        "La pantalla o la pestaña cambió. Vuelve a calibrar para mantener la precisión del video.",
      );
      setStage("setup");
    };
    window.addEventListener("resize", interrupt);
    document.addEventListener("visibilitychange", interrupt);
    return () => {
      window.removeEventListener("resize", interrupt);
      document.removeEventListener("visibilitychange", interrupt);
    };
  }, [stage, cleanup]);

  const immersive = ["calibration", "validation", "drift", "stimulus"].includes(
    stage,
  );
  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [immersive]);

  const startSession = useCallback(async () => {
    if (
      !videoStimulus ||
      !referenceConfirmed ||
      distanceCm < 10 ||
      distanceCm > 200
    )
      return;
    setError(null);
    setStage("loading");
    setStatusNote("Verificando modelos de mirada y cámara…");
    cleanup();
    faceRecoveryAttemptRef.current = 0;
    const run = ++runIdRef.current;

    try {
      await checkModelAssets();
      await checkCdnReachable();
      if (run !== runIdRef.current) return;

      const vid = document.createElement("video");
      vid.autoplay = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.width = 640;
      vid.height = 480;
      vid.className =
        "pointer-events-none fixed top-0 left-0 size-px opacity-0";
      document.body.appendChild(vid);
      webcamVideoRef.current = vid;

      if (videoStimulus.facialCoding) {
        setStatusNote("Cargando detector de expresiones faciales…");
        const { FaceLandmarker, FilesetResolver } =
          await import("@mediapipe/tasks-vision");
        const fileset =
          await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
          fileset,
          {
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            baseOptions: {
              modelAssetPath: FACE_LANDMARKER_MODEL,
              delegate: "CPU",
            },
          },
        ).catch(() =>
          FaceLandmarker.createFromOptions(fileset, {
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            baseOptions: {
              modelAssetPath: FACE_LANDMARKER_MODEL,
              delegate: "CPU",
            },
          }),
        );
      }
      if (run !== runIdRef.current) return;

      setStatusNote("Activando cámara…");
      const engine = createWebEyeTrackEngine();
      engineRef.current = engine;
      rawFramesRef.current = [];
      calibratedFramesRef.current = [];

      await engine.start(
        vid,
        (frame) => {
          rawFramesRef.current = [...rawFramesRef.current.slice(-4000), frame];
          const fit = calibrationFitRef.current;
          const mapped =
            fit && frame.x !== null && frame.y !== null
              ? (() => {
                  const pt = applyCalibration(fit, {
                    x: frame.x / window.innerWidth,
                    y: frame.y / window.innerHeight,
                  });
                  return {
                    x: pt.x * window.innerWidth,
                    y: pt.y * window.innerHeight,
                  };
                })()
              : { x: frame.x, y: frame.y };
          const calFrame: GazeFrame = { ...frame, x: mapped.x, y: mapped.y };
          calibratedFramesRef.current = [
            ...calibratedFramesRef.current.slice(-4000),
            calFrame,
          ];
          latestReadingRef.current = {
            x: mapped.x,
            y: mapped.y,
            blendshapes: latestReadingRef.current?.blendshapes ?? null,
            matrixData: latestReadingRef.current?.matrixData ?? null,
            gazeCapturedAt: frame.t,
            facialCapturedAt: latestReadingRef.current?.facialCapturedAt,
          };
        },
        (engineErr) => {
          cleanup();
          setError(engineErr.message);
          setStage("setup");
        },
      );
      if (run !== runIdRef.current) {
        engine.stop();
        return;
      }

      setStatusNote("Comprobando la iluminación de tu rostro…");
      const light = await new Promise<LightingStatus>((resolve) => {
        let stopObserver = () => {};
        const finish = (status: LightingStatus) => {
          if (status === "checking") return;
          clearTimeout(timeout);
          stopObserver();
          stopLightingRef.current = null;
          resolve(status);
        };
        const timeout = setTimeout(() => finish("unavailable"), 8000);
        stopObserver = observeLighting(vid, finish);
        stopLightingRef.current = () => finish("unavailable");
      });
      if (run !== runIdRef.current) return;
      if (light !== "good") throw new Error(LIGHTING_MESSAGES[light]);

      calibrationPairsRef.current = [];
      calibrationFitRef.current = null;
      initialDriftRef.current = null;
      pendingObservationRef.current = null;
      geometryRef.current = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setCalibPoints([
        ...calibrationGrid(window.innerWidth, window.innerHeight),
        ...refinementGrid(window.innerWidth, window.innerHeight),
      ]);
      setCalibIndex(0);
      setStage("calibration");
    } catch (err) {
      if (run !== runIdRef.current) return;
      cleanup();
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar la cámara o los modelos.",
      );
      setStage("setup");
    }
  }, [cleanup, videoStimulus, referenceConfirmed, distanceCm]);

  const measureGeometry = useCallback(
    () => ({
      screenWidthPx: window.screen.width,
      screenWidthCm: screenWidthFromReference(
        referenceWidth,
        window.screen.width,
      ),
      distanceCm,
    }),
    [referenceWidth, distanceCm],
  );

  const runDriftCheck = useCallback(
    async (afterAssetCount: number, run: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
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
        await sleep(CALIB_SETTLE_MS + DRIFT_MEASURE_MS);
        if (run !== runIdRef.current) return null;
        let win = {
          from: from + CALIB_SETTLE_MS,
          to: from + CALIB_SETTLE_MS + DRIFT_MEASURE_MS,
        };
        let result = evaluateTarget(
          targets[i],
          calibratedFramesRef.current,
          win.from,
          win.to,
        );
        if (
          result.gaze === null ||
          driftFrameStats(calibratedFramesRef.current, [win]).validRatio < 0.8
        ) {
          const retryFrom = performance.now();
          await sleep(1400);
          if (run !== runIdRef.current) return null;
          win = { from: retryFrom, to: retryFrom + 1400 };
          result = evaluateTarget(
            targets[i],
            calibratedFramesRef.current,
            win.from,
            win.to,
          );
        }
        windows.push(win);
        results.push(result);
      }

      return buildDriftCheck(
        afterAssetCount,
        results,
        driftFrameStats(calibratedFramesRef.current, windows),
        measureGeometry(),
        device,
      );
    },
    [device, measureGeometry],
  );

  const finishValidationAndStartVideo = useCallback(async () => {
    const run = runIdRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const targets = validationTargets(width, height);
    setValTargets(targets);
    setValIndex(0);
    setError(null);
    setStage("validation");

    const startedAt = performance.now();
    const results: TargetResult[] = [];
    for (let i = 0; i < targets.length; i++) {
      setValIndex(i);
      const from = performance.now();
      await sleep(CALIB_SETTLE_MS + VAL_MEASURE_MS);
      if (run !== runIdRef.current) return;
      results.push(
        evaluateTarget(
          targets[i],
          calibratedFramesRef.current,
          from + CALIB_SETTLE_MS,
          from + CALIB_SETTLE_MS + VAL_MEASURE_MS,
        ),
      );
    }

    const endedAt = performance.now();
    const geometry = measureGeometry();
    const stream = frameStats(calibratedFramesRef.current, startedAt, endedAt);
    const summary = summarize(results, geometry);

    // Control inicial de deriva (afterAssetCount: 0)
    const driftCheck = await runDriftCheck(0, run);
    if (!driftCheck || run !== runIdRef.current) return;

    const validationPassed =
      verdict(summary, stream.fps, device).pass && stream.validRatio >= 0.8;

    if (!validationPassed || !driftCheck.passed) {
      cleanup();
      const reasons = driftCheck.passed
        ? ["La validación de precisión no alcanzó el umbral requerido."]
        : driftFailures(driftCheck, device);
      setError(
        `${reasons.join(" ")} Ajusta tu posición/iluminación y vuelve a calibrar.`,
      );
      setStage("setup");
      return;
    }

    const initialDrift = driftSummary(driftCheck);
    initialDriftRef.current = initialDrift;
    qualityRef.current = {
      engineId: "webeyetrack@0.0.2",
      measurementStatus: "validated",
      medianErrorDeg: summary.medianErrorDeg,
      coverage: summary.coverage,
      fps: stream.fps,
      validRatio: stream.validRatio,
      passed: true,
      calibrationClicks: calibrationPairsRef.current.length,
      calibrationLayout: calibrationFitRef.current?.refinement
        ? "v5-weighted-refinement"
        : "v5-weighted-base-fallback",
      driftChecks: [initialDrift],
    };

    if (!preview && !sessionIdRef.current) {
      try {
        const deviceType =
          device === "laptop"
            ? "desktop"
            : device === "phone"
              ? "mobile"
              : "tablet";
        const res = await fetch(`/api/s/${token}/eye/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            consent: true,
            protocol: "eye-v3",
            device: {
              deviceType,
              screenWidth: window.screen.width,
              screenHeight: window.screen.height,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.sessionId) {
          throw new Error(json.message ?? "No se pudo iniciar la sesión.");
        }
        sessionIdRef.current = json.sessionId;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo iniciar la sesión.",
        );
        setStage("setup");
        cleanup();
        return;
      }
    }

    setStage("stimulus");
  }, [cleanup, device, measureGeometry, preview, runDriftCheck, token]);

  async function onCalibrationClick() {
    if (samplingDot) return;
    setError(null);
    setSamplingDot(true);
    const run = runIdRef.current;
    const now = performance.now();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const recentFrom = Math.max(
      now - 2000,
      rawFramesRef.current[0]?.t ?? now - 2000,
    );
    const captureMs = fixationWindowMs(
      frameStats(rawFramesRef.current, recentFrom, now).fps,
    );
    await sleep(Math.max(900, captureMs + 200));

    if (run !== runIdRef.current) return;
    const end = performance.now();
    const fix = assessFixation(
      rawFramesRef.current,
      Math.max(now + 150, end - captureMs),
      end,
      viewport,
    );
    setSamplingDot(false);
    if (!fix.ok) {
      setError(
        "Mantén la mirada fija en el punto mientras haces clic.",
      );
      return;
    }

    const pt = calibPoints[calibIndex];
    const nextPairs = [
      ...calibrationPairsRef.current,
      {
        gaze: fix.gaze,
        target: { x: pt.x / viewport.width, y: pt.y / viewport.height },
        phase: calibIndex < 9 ? ("base" as const) : ("refinement" as const),
        quality: fix.quality,
      },
    ];
    calibrationPairsRef.current = nextPairs;

    if (calibIndex + 1 < calibPoints.length) {
      setCalibIndex((i) => i + 1);
      return;
    }

    try {
      calibrationFitRef.current = finalizeCalibration(nextPairs);
      await finishValidationAndStartVideo();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo ajustar la calibración. Intenta de nuevo.",
      );
      calibrationPairsRef.current = [];
      setCalibIndex(0);
    }
  }

  const runPostVideoDriftAndSave = useCallback(async () => {
    const observation = pendingObservationRef.current;
    if (!observation) return;

    if (preview) {
      cleanup();
      setStage("done");
      return;
    }

    const run = runIdRef.current;
    const finalDrift = await runDriftCheck(1, run);
    if (!finalDrift || run !== runIdRef.current) return;

    if (!finalDrift.passed) {
      setError(
        `${driftFailures(finalDrift, device).join(" ")} Repite esta comprobación final de 3 puntos sin moverte para guardar tus resultados.`,
      );
      setStage("drift-retry");
      return;
    }

    const baseQuality = qualityRef.current;
    const initialDrift = initialDriftRef.current;
    if (!baseQuality || !initialDrift || !sessionIdRef.current) {
      cleanup();
      setError("La sesión expiró o quedó incompleta. Vuelve a iniciar.");
      setStage("setup");
      return;
    }

    const finalQuality: EyeQuality = {
      ...baseQuality,
      driftChecks: [initialDrift, driftSummary(finalDrift)],
    };
    qualityRef.current = finalQuality;

    cleanup();
    setStage("saving");
    try {
      const res = await fetch(`/api/s/${token}/eye/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          quality: finalQuality,
          observations: [observation],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? "No se pudieron guardar las lecturas.");
      }
      pendingObservationRef.current = null;
      setStage("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar las lecturas.",
      );
      setStage("setup");
    }
  }, [cleanup, device, preview, runDriftCheck, token]);

  const handleVideoComplete = useCallback(
    async ({ observation }: { observation: VideoObservation }) => {
      pendingObservationRef.current = observation;
      await runPostVideoDriftAndSave();
    },
    [runPostVideoDriftAndSave],
  );

  if (!videoStimulus) {
    return (
      <StatusScreen icon="ban" title="Video no disponible">
        <p>Este estudio aún no tiene un video configurado.</p>
      </StatusScreen>
    );
  }

  if (stage === "done") {
    return (
      <StatusScreen icon="check" title="¡Gracias! Tu participación se guardó">
        <p>
          {preview
            ? "Vista previa completada (no se guardaron datos)."
            : "Ya puedes cerrar esta pestaña. No se grabó ni almacenó ningún video de tu cámara."}
        </p>
      </StatusScreen>
    );
  }

  if (stage === "saving") {
    return (
      <StatusScreen icon="clock" title="Guardando tus lecturas…">
        <p>Estamos registrando los resultados del estudio.</p>
      </StatusScreen>
    );
  }

  if (stage === "calibration") {
    const pt = calibPoints[calibIndex] ?? { x: 200, y: 200 };
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="mx-auto max-w-md pt-6 text-center">
          <p className="text-sm font-medium text-heading">
            Calibración · punto {calibIndex + 1} de {calibPoints.length}
          </p>
          <p className="text-xs text-muted">
            Mira directamente al círculo y haz clic sin mover la cabeza.
          </p>
          {error ? (
            <div className="mt-2 px-4 text-left">
              <Alert tone="error">{error}</Alert>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCalibrationClick}
          disabled={samplingDot}
          style={{ left: pt.x - 18, top: pt.y - 18 }}
          aria-label={`Punto de calibración ${calibIndex + 1}`}
          className={`fixed h-9 w-9 rounded-full border-2 border-white shadow-lg transition ${
            samplingDot
              ? "scale-125 bg-amber-400"
              : "bg-primary hover:scale-110"
          }`}
        />
      </div>
    );
  }

  if (stage === "validation" || stage === "drift") {
    const pt = valTargets[valIndex] ?? { x: 200, y: 200 };
    const isDrift = stage === "drift";
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="mx-auto max-w-md pt-6 text-center">
          <p className="text-sm font-medium text-heading">
            {isDrift ? "Comprobando estabilidad" : "Verificando precisión"} (
            {valIndex + 1} de {valTargets.length})…
          </p>
          <p className="text-xs text-muted">
            Solo sigue el punto con tu mirada.
          </p>
        </div>
        <div
          data-testid={
            isDrift ? "video-drift-target" : "video-validation-target"
          }
          style={{ left: pt.x - 14, top: pt.y - 14 }}
          className={`fixed h-7 w-7 rounded-full border-2 border-white shadow-lg ${
            isDrift ? "bg-sky-500" : "bg-emerald-500"
          }`}
        />
      </div>
    );
  }

  if (stage === "drift-retry") {
    return (
      <ParticipantScreen>
        <ScreenHeader
          icon="eye"
          eyebrow="Comprobación final"
          title={study.name}
        />
        <Section title="Confirmar precisión final">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="button" onClick={() => void runPostVideoDriftAndSave()}>
            Repetir comprobación de 3 puntos y guardar
          </Button>
        </Section>
      </ParticipantScreen>
    );
  }

  if (stage === "stimulus") {
    return (
      <div className="min-h-screen px-4 py-6">
        <VideoNeuroRunner
          assetId={videoStimulus.assetId}
          title={videoStimulus.title}
          playbackUrl={videoStimulus.playbackUrl}
          durationMs={videoStimulus.durationMs}
          maxDurationMs={videoStimulus.maxDurationSeconds * 1000}
          aois={videoStimulus.aois}
          scenes={videoStimulus.scenes}
          facialCoding={videoStimulus.facialCoding}
          latestReadingRef={latestReadingRef}
          onComplete={handleVideoComplete}
        />
      </div>
    );
  }

  return (
    <ParticipantScreen>
      <ScreenHeader
        icon="eye"
        eyebrow="Eye tracking en video"
        title={study.name}
      />
      {preview ? (
        <Alert tone="info">
          Modo vista previa: no se guardarán respuestas.
        </Alert>
      ) : null}
      <Section title="Antes de empezar">
        <FactList
          items={[
            {
              icon: "target",
              text: "Calibrarás tu mirada en 18 puntos y luego verás un video de principio a fin.",
            },
            {
              icon: "lock",
              text: videoStimulus.facialCoding
                ? "Tu cámara calcula coordenadas de mirada y gestos faciales en tiempo real en tu dispositivo; nunca se graba ni envía video."
                : "Tu cámara estima coordenadas de mirada en tu dispositivo; nunca se graba ni envía video.",
            },
            {
              icon: "user",
              text: "Buena iluminación frontal y rostro visible sin mover mucho la cabeza.",
            },
          ]}
        />
        <Field label="Ajustar tarjeta de referencia">
          <input
            type="range"
            min="80"
            max="280"
            value={referenceWidth}
            onChange={(e) => {
              setReferenceWidth(Number(e.target.value));
              setReferenceConfirmed(false);
            }}
          />
        </Field>
        <div
          aria-label="Tarjeta de referencia en vertical"
          className="mx-auto rounded-lg border-2 border-primary bg-surface"
          style={{
            width: referenceWidth,
            height: (referenceWidth * 85.6) / 53.98,
          }}
        />
        <ConsentCheck
          checked={referenceConfirmed}
          onChange={setReferenceConfirmed}
        >
          El dibujo coincide con mi tarjeta estándar en vertical (sin mostrar
          datos a la cámara).
        </ConsentCheck>
        <Field label="Distancia de tus ojos a la pantalla (cm)">
          <Input
            type="number"
            min={10}
            max={200}
            value={distanceCm}
            onChange={(e) => setDistanceCm(Number(e.target.value))}
          />
        </Field>
        {device === "phone" ? (
          <p className="text-sm text-muted">
            Coloca el celular en un soporte o stand fijo, a la altura de tus
            ojos.
          </p>
        ) : null}
        <ConsentCheck checked={consent} onChange={setConsent}>
          Acepto activar mi cámara para medir mirada y gestos faciales en este
          dispositivo (sin grabar video).
        </ConsentCheck>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {stage === "loading" ? (
          <p className="text-sm text-muted">{statusNote}</p>
        ) : (
          <Button
            type="button"
            disabled={
              !consent ||
              !referenceConfirmed ||
              distanceCm < 10 ||
              distanceCm > 200
            }
            onClick={() => void startSession()}
          >
            Activar cámara y calibrar
          </Button>
        )}
      </Section>
    </ParticipantScreen>
  );
}
