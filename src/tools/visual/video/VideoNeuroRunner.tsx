"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractHeadPoseDeg } from "@/lab/facial/blendshapes";
import type { BlendshapeMap } from "@/lab/facial/blendshapes";
import {
  collectVideoObservation,
  computeVideoContentRect,
  type MultimodalVideoFrame,
  type LiveVideoReading,
  isRecentReading,
} from "./collector";
import {
  measureVideoObservation,
  type VideoParticipantMetrics,
} from "./metrics";
import type { VideoAoi, VideoObservation, VideoScene } from "./schema";

export interface VideoNeuroRunnerProps {
  assetId: string;
  title: string;
  /** URL de reproducción del video del estudio. */
  playbackUrl: string;
  durationMs: number;
  maxDurationMs?: number;
  aois: VideoAoi[];
  scenes: VideoScene[];
  facialCoding?: boolean;
  /** Lectura en vivo inyectada por el motor de cámara (mirada + 52 blendshapes + matriz de pose). */
  latestReadingRef?: React.RefObject<LiveVideoReading | null>;
  onComplete?: (result: {
    observation: VideoObservation;
    metrics: VideoParticipantMetrics;
  }) => void;
}

type RunnerStage =
  "preloading" | "ready" | "baseline" | "playing" | "completed" | "error";

const BASELINE_DURATION_MS = 3000;
const SAMPLE_INTERVAL_MS = 33; // ~30 Hz

export function VideoNeuroRunner({
  assetId,
  title,
  playbackUrl,
  durationMs,
  maxDurationMs = 300_000,
  aois,
  scenes,
  facialCoding = true,
  latestReadingRef,
  onComplete,
}: VideoNeuroRunnerProps) {
  const [stage, setStage] = useState<RunnerStage>("preloading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [baselineCountdownMs, setBaselineCountdownMs] =
    useState(BASELINE_DURATION_MS);
  const [progressPct, setProgressPct] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const baselineSamplesRef = useRef<BlendshapeMap[]>([]);
  const videoFramesRef = useRef<MultimodalVideoFrame[]>([]);
  const stallsRef = useRef(0);

  // 1. Precarga completa del video a un Blob local para garantizar 0 buffering
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    async function preloadVideo() {
      setStage("preloading");
      setErrorMessage(null);
      try {
        const res = await fetch(playbackUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(
            `No se pudo cargar el video del estudio (HTTP ${res.status}).`,
          );
        }
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setStage("ready");
      } catch (err) {
        if (!active) return;
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Falló la precarga del video del estudio.",
        );
        setStage("error");
      }
    }

    void preloadVideo();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [playbackUrl]);

  const finishPlayback = useCallback(() => {
    const video = videoRef.current;
    const domRect = video?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
    };
    const intrinsicW = video?.videoWidth || 1280;
    const intrinsicH = video?.videoHeight || 720;
    const contentRect = computeVideoContentRect(
      {
        left: domRect.left,
        top: domRect.top,
        width: domRect.width,
        height: domRect.height,
      },
      intrinsicW,
      intrinsicH,
    );

    const actualDurationMs =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : durationMs;

    const observation = collectVideoObservation({
      assetId,
      durationMs: actualDurationMs,
      frames: videoFramesRef.current,
      baselineFrames: facialCoding ? baselineSamplesRef.current : [],
      rect: contentRect,
      playbackStalls: stallsRef.current,
      audioMuted: Boolean(video?.muted),
    });

    const metrics = measureVideoObservation(
      observation,
      { aois, scenes, binMs: 1000 },
      { width: intrinsicW, height: intrinsicH },
    );

    setStage("completed");
    onComplete?.({ observation, metrics });
  }, [aois, assetId, durationMs, facialCoding, onComplete, scenes]);

  // 2. Ventana de 3 segundos de línea base facial neutra antes de reproducir el video (cuando Facial Coding está activo)
  const startBaselineAndPlay = useCallback(() => {
    baselineSamplesRef.current = [];
    videoFramesRef.current = [];
    stallsRef.current = 0;

    if (!facialCoding) {
      setStage("playing");
      return;
    }

    setBaselineCountdownMs(BASELINE_DURATION_MS);
    setStage("baseline");
  }, [facialCoding]);

  useEffect(() => {
    if (stage !== "baseline") return;
    let lastFacial = -1;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, BASELINE_DURATION_MS - Math.round(elapsed));
      setBaselineCountdownMs(remaining);

      const reading = latestReadingRef?.current;
      if (
        reading?.blendshapes &&
        isRecentReading(reading.facialCapturedAt, performance.now()) &&
        reading.facialCapturedAt !== lastFacial &&
        extractHeadPoseDeg(reading.matrixData)?.poseValid
      ) {
        lastFacial = reading.facialCapturedAt!;
        baselineSamplesRef.current.push(reading.blendshapes);
      }

      if (elapsed >= BASELINE_DURATION_MS) {
        clearInterval(timer);
        if (baselineSamplesRef.current.length < 10) {
          setErrorMessage(
            "No obtuvimos suficientes lecturas faciales recientes. Centra el rostro y vuelve a iniciar.",
          );
          setStage("ready");
        } else setStage("playing");
      }
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stage, latestReadingRef]);

  // 3. Reproducción sincronizada con muestreo anclado a `video.currentTime`
  useEffect(() => {
    if (stage !== "playing") return;
    const video = videoRef.current;
    if (!video) return;

    void video.play().catch(() => {
      setErrorMessage(
        "El navegador bloqueó el inicio del video. Pulsa de nuevo para reproducir con audio.",
      );
      setStage("ready");
    });

    let lastGaze = -1;
    let lastFacial = -1;
    const sampleTimer = setInterval(() => {
      if (video.paused || video.ended) return;
      const videoTimeMs = Math.round(video.currentTime * 1000);
      const reading = latestReadingRef?.current;
      const now = performance.now();
      const gazeNew =
        isRecentReading(reading?.gazeCapturedAt, now) &&
        reading!.gazeCapturedAt !== lastGaze;
      const facialNew =
        facialCoding &&
        isRecentReading(reading?.facialCapturedAt, now) &&
        reading!.facialCapturedAt !== lastFacial;
      if (gazeNew || facialNew) {
        if (gazeNew) lastGaze = reading!.gazeCapturedAt!;
        if (facialNew) lastFacial = reading!.facialCapturedAt!;
        videoFramesRef.current.push({
          videoTimeMs,
          x: gazeNew ? (reading?.x ?? null) : null,
          y: gazeNew ? (reading?.y ?? null) : null,
          blendshapes: facialNew ? (reading?.blendshapes ?? null) : null,
          matrixData: facialNew ? (reading?.matrixData ?? null) : null,
        });
      }
      if (video.duration > 0) {
        setProgressPct(
          Math.min(100, Math.round((video.currentTime / video.duration) * 100)),
        );
      }
    }, SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(sampleTimer);
      video.pause();
    };
  }, [facialCoding, latestReadingRef, stage]);

  return (
    <Card className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted">
            {facialCoding
              ? "Eye Tracking en video + Facial Coding (12 gestos FACS)"
              : "Eye Tracking en video"}
          </p>
        </div>
        {stage === "playing" && (
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium">
            Reproduciendo · {progressPct}%
          </span>
        )}
      </div>

      {stage === "preloading" && (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-8 text-center">
          <p className="text-sm font-medium">Preparando video del estudio…</p>
          <p className="mt-1 text-xs text-muted">
            Se descarga en memoria local antes de iniciar para evitar
            interrupciones durante la medición.
          </p>
        </div>
      )}

      {stage === "error" && errorMessage && (
        <Alert tone="error">{errorMessage}</Alert>
      )}

      {stage === "ready" && (
        <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface/50 p-8 text-center">
          <p className="max-w-lg text-sm">
            {facialCoding ? (
              <>
                El video está listo en memoria. Primero mediremos tu expresión
                en reposo durante <strong>3 segundos</strong> mirando la cruz
                central y después iniciará el video automáticamente con sonido.
              </>
            ) : (
              "El video está listo en memoria. Pulsa el botón para iniciar la reproducción."
            )}
          </p>
          {errorMessage && (
            <div className="max-w-lg text-left">
              <Alert tone="error">{errorMessage}</Alert>
            </div>
          )}
          <Button onClick={startBaselineAndPlay}>
            {facialCoding
              ? "Calibrar expresión neutra (3 s) e iniciar video"
              : "Iniciar video"}
          </Button>
        </div>
      )}

      {stage === "baseline" && (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-xl bg-black text-white">
          <div
            aria-label="Cruz de fijación central"
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400/90 text-2xl font-bold text-amber-400"
          >
            +
          </div>
          <p className="text-sm font-medium text-amber-400">
            Mantén la mirada en la cruz con el rostro relajado…
          </p>
          <p className="mt-1 text-xs text-white/70">
            Iniciando en {(baselineCountdownMs / 1000).toFixed(1)} s
          </p>
        </div>
      )}

      <div className={stage === "playing" ? "block" : "hidden"}>
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            src={blobUrl ?? undefined}
            playsInline
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration * 1000;
              if (
                !Number.isFinite(duration) ||
                duration < 1000 ||
                duration > maxDurationMs
              ) {
                setErrorMessage(
                  "La duración del video no es compatible con este estudio.",
                );
                setStage("error");
              }
            }}
            controls={false}
            disablePictureInPicture
            className="max-h-[75vh] w-full object-contain"
            onWaiting={() => {
              stallsRef.current += 1;
            }}
            onEnded={finishPlayback}
          />
        </div>
      </div>

      {stage === "completed" && (
        <div className="rounded-xl border border-border bg-surface/60 p-6 text-center">
          <p className="text-base font-semibold">
            Medición de video completada
          </p>
          <p className="mt-1 text-xs text-muted">
            Las coordenadas de mirada
            {facialCoding ? " y expresiones faciales" : ""} se procesaron en tu
            dispositivo sin almacenar ningún fotograma de tu cámara.
          </p>
        </div>
      )}
    </Card>
  );
}
