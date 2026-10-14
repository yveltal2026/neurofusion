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
import { buildSession, type ExportedSession, type Lighting } from "./session";

type Stage = "setup" | "loading" | "position" | "calibration" | "countdown" | "validation" | "results" | "free";

/** Tiempo para que el ojo llegue al punto antes de medir, y ventana de medición, por objetivo. */
const SETTLE_MS = 1000;
const MEASURE_MS = 1500;
/** La librería ignora clics a menos de 1 s del anterior; el siguiente punto se activa pasado ese plazo. */
const CALIB_ACTIVATE_MS = 1200;
const COUNTDOWN_S = 3;
/** Evita que el arreglo de lecturas crezca sin límite en el modo libre (≈ 10 min a 30 lecturas/s). */
const MAX_FRAMES = 20_000;

const PRESETS: Record<DeviceType, { widthCm: string; distanceCm: string; label: string }> = {
  laptop: { widthCm: "31", distanceCm: "50", label: "Laptop / escritorio" },
  phone: { widthCm: "6.5", distanceCm: "30", label: "Celular" },
  tablet: { widthCm: "17", distanceCm: "40", label: "Tableta" },
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function guessDevice(): DeviceType {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "laptop";
  return Math.min(window.screen.width, window.screen.height) < 600 ? "phone" : "tablet";
}

/** Orden inverso en la segunda pasada para no repetir el mismo recorrido. */
function buildCalibrationPoints(passes: number): Point[] {
  const grid = calibrationGrid(window.innerWidth, window.innerHeight);
  const out: Point[] = [];
  for (let p = 0; p < passes; p++) out.push(...(p % 2 ? [...grid].reverse() : grid));
  return out;
}

export function EyeTrackingLab() {
  const [stage, setStage] = useState<Stage>("setup");
  const [error, setError] = useState<string | null>(null);

  // Formulario
  const [participant, setParticipant] = useState("");
  // Este componente solo se monta en el cliente (EyeTrackingLabClient), así que puede leer `window` al inicializar.
  const [device, setDevice] = useState<DeviceType>(guessDevice);
  const [widthCm, setWidthCm] = useState(() => PRESETS[guessDevice()].widthCm);
  const [distanceCm, setDistanceCm] = useState(() => PRESETS[guessDevice()].distanceCm);
  const [glasses, setGlasses] = useState(false);
  const [lighting, setLighting] = useState<Lighting>("buena");
  const [passes, setPasses] = useState(1);

  // Progreso
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  const [calibIndex, setCalibIndex] = useState(0);
  /** Índice del punto ya “armado”; el punto actual está activo solo si coincide con `calibIndex`. */
  const [armedIndex, setArmedIndex] = useState(-1);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);
  const [valIndex, setValIndex] = useState(0);
  const [valTargets, setValTargets] = useState<Point[]>([]);
  const [live, setLive] = useState({ fps: 0, faceOk: false });
  const [session, setSession] = useState<ExportedSession | null>(null);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GazeEngine | null>(null);
  const framesRef = useRef<GazeFrame[]>([]);
  const readyMsRef = useRef(0);
  const calibStartRef = useRef(0);
  const calibClicksRef = useRef(0);
  const calibDurationRef = useRef(0);
  const lastClickRef = useRef(0);
  const runIdRef = useRef(0);

  // WebEyeTrack toma como muestra de calibración CADA clic de la ventana (escucha en `window`).
  // Este filtro impide que le lleguen los clics que no sean sobre el punto activo (botones, taps
  // accidentales). Se decide en la fase de CAPTURA, antes de que React procese el clic: en la de burbujeo
  // el clic sobre el punto ya habría cambiado el estado y quitado su marca, y se bloquearía el bueno.
  // React escucha en su raíz (más abajo que `document`), así que sus manejadores no se ven afectados.
  useEffect(() => {
    const allowed = new WeakSet<Event>();
    const mark = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-calib-dot]")) allowed.add(e);
    };
    const block = (e: MouseEvent) => {
      if (!allowed.has(e)) e.stopPropagation();
    };
    document.addEventListener("click", mark, true);
    document.addEventListener("click", block);
    return () => {
      document.removeEventListener("click", mark, true);
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
  const immersive = stage === "calibration" || stage === "countdown" || stage === "validation" || stage === "free";
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

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
    const geometryOk = Number(widthCm) > 0 && Number(distanceCm) > 0;
    if (!participant.trim()) return setError("Escribe un código para la persona (por ejemplo P01). No uses nombres.");
    if (!geometryOk) return setError("El ancho de pantalla y la distancia deben ser números positivos.");

    setStage("loading");
    try {
      // `?engine=fake` usa un simulador (puntero como mirada) para probar el flujo sin cámara ni modelos.
      const fake = new URLSearchParams(window.location.search).get("engine") === "fake";
      if (!fake) {
        await requestCamera();
        await checkModelAssets();
        await checkCdnReachable();
      }
      const engine = fake ? (await import("./engine.fake")).createFakeEngine() : createWebEyeTrackEngine();
      engineRef.current = engine;
      framesRef.current = [];
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
    setError(null);
    const points = buildCalibrationPoints(passes);
    setCalibPoints(points);
    setCalibIndex(0);
    setArmedIndex(-1);
    calibClicksRef.current = 0;
    lastClickRef.current = 0;
    calibStartRef.current = performance.now();
    setStage("calibration");
  }

  // Cada punto se “arma” pasado el plazo de antirrebote de la librería.
  useEffect(() => {
    if (stage !== "calibration") return;
    const id = setTimeout(() => setArmedIndex(calibIndex), CALIB_ACTIVATE_MS);
    return () => clearTimeout(id);
  }, [stage, calibIndex]);
  const dotActive = stage === "calibration" && armedIndex === calibIndex;

  function onCalibrationDot() {
    const now = performance.now();
    if (now - lastClickRef.current < 1000) return;
    lastClickRef.current = now;
    calibClicksRef.current++;
    if (calibIndex + 1 >= calibPoints.length) {
      calibDurationRef.current = now - calibStartRef.current;
      setCountdown(COUNTDOWN_S);
      setStage("countdown");
    } else {
      setCalibIndex(calibIndex + 1);
    }
  }

  const runValidation = useCallback(async () => {
    const runId = ++runIdRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targets = validationTargets(vw, vh);
    setValTargets(targets);
    setValIndex(0);
    setStage("validation");

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
        geometry: { screenWidthPx: window.screen.width, screenWidthCm: Number(widthCm), distanceCm: Number(distanceCm) },
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
        calibration: { passes, clicks: calibClicksRef.current, durationMs: Math.round(calibDurationRef.current) },
        validation: { results, stream: frameStats(framesRef.current, startedAt, endedAt), durationMs: Math.round(endedAt - startedAt) },
        createdAt: new Date(),
      }),
    );
    setStage("results");
  }, [participant, device, glasses, lighting, widthCm, distanceCm, passes]);

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
    setWidthCm(PRESETS[next].widthCm);
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
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Laboratorio · interno</p>
            <h1 className="text-2xl font-semibold">Prueba de eye tracking con webcam</h1>
            <p className="text-sm text-muted">
              Mide qué tan preciso es WebEyeTrack en este dispositivo. Tarda unos 2 minutos: calibración de 9 puntos y
              validación de 8.
            </p>
          </header>

          <Alert tone="info">
            <p>
              El video se procesa en este dispositivo y no se envía a ningún servidor de NeuroFusion; el resultado solo
              se guarda si lo descargas. Los modelos de MediaPipe se bajan de <code>cdn.jsdelivr.net</code> y{" "}
              <code>storage.googleapis.com</code>.
            </p>
          </Alert>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Card className="space-y-4">
            <Field label="Código de la persona" hint="Por ejemplo P01. No pongas nombres ni correos.">
              <Input value={participant} onChange={(e) => setParticipant(e.target.value)} maxLength={24} autoComplete="off" />
            </Field>

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
              <Field label="Ancho de la pantalla (cm)" hint="Físico, en la orientación actual. Mídelo con regla.">
                <Input type="number" inputMode="decimal" step="0.1" min="1" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
              </Field>
              <Field label="Distancia a los ojos (cm)" hint="Aproximada, con la postura de uso normal.">
                <Input type="number" inputMode="decimal" step="1" min="10" value={distanceCm} onChange={(e) => setDistanceCm(e.target.value)} />
              </Field>
            </div>

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
              <Field label="Pasadas de calibración">
                <select
                  className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm"
                  value={passes}
                  onChange={(e) => setPasses(Number(e.target.value))}
                >
                  <option value={1}>1 (9 clics)</option>
                  <option value={2}>2 (18 clics)</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={glasses} onChange={(e) => setGlasses(e.target.checked)} className="size-4" />
              Usa lentes
            </label>

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
            Punto {calibIndex + 1} de {calibPoints.length}. Mira el punto y, cuando se ponga verde, tócalo o haz clic sin
            dejar de mirarlo.
          </p>
          <button
            type="button"
            aria-label={`Punto de calibración ${calibIndex + 1}`}
            data-calib-dot={dotActive ? "" : undefined}
            disabled={!dotActive}
            onClick={onCalibrationDot}
            className={`absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 transition-colors ${
              dotActive ? "border-heading bg-primary" : "border-border bg-transparent"
            }`}
            style={{ left: calibPoints[calibIndex].x, top: calibPoints[calibIndex].y }}
          />
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

      {stage === "validation" && valTargets[valIndex] ? (
        <div className="fixed inset-0 z-50 bg-background select-none">
          <p className="absolute top-4 right-0 left-0 px-4 text-center text-xs text-muted" role="status">
            Objetivo {valIndex + 1} de {valTargets.length}. Solo mira el punto.
          </p>
          <div
            aria-hidden="true"
            data-testid="validation-target"
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
            <h1 className="text-2xl font-semibold">Resultados de la validación</h1>
          </header>

          {error ? <Alert tone="error">{error}</Alert> : null}
          <ResultsView session={session} />

          <Card className="space-y-3">
            <h2 className="text-base font-semibold">Guardar y seguir</h2>
            <div className="flex flex-wrap gap-3">
              <Button onClick={downloadJson}>Descargar JSON</Button>
              <Button variant="secondary" onClick={copyJson}>
                {copied ? "Copiado" : "Copiar JSON"}
              </Button>
              <Button variant="secondary" onClick={() => void runValidation()}>
                Repetir validación
              </Button>
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
          </Card>
        </div>
      ) : null}
    </>
  );
}
