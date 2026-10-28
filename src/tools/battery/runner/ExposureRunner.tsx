"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ParticipantScreen, ScreenHeader, StatusScreen } from "@/components/participant";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withRetry } from "@/tools/iat/runner/api";
import { EXPOSURE_SECONDS } from "../engine";
import type { ExposurePiece } from "../participant";
import { batteryApi } from "./api";

function Screen({ children }: { children: React.ReactNode }) {
  return <ParticipantScreen width="3xl">{children}</ParticipantScreen>;
}

/**
 * Una pieza a pantalla completa. La cuenta de segundos empieza cuando la imagen terminó de cargar
 * (no se le descuenta tiempo por una conexión lenta) y el botón sólo se habilita al llegar a cero.
 */
function PieceView({
  piece,
  index,
  total,
  seconds,
  onNext,
}: {
  piece: ExposurePiece;
  index: number;
  total: number;
  seconds: number;
  onNext: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [remaining, setRemaining] = useState(seconds);
  const last = index + 1 === total;

  const done = remaining <= 0;
  useEffect(() => {
    if (!loaded || done) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [loaded, done]);

  const ready = loaded && done;
  return (
    <Screen>
      <ScreenHeader
        eyebrow={total > 1 ? `Imagen ${index + 1} de ${total}` : undefined}
        title="Mira con atención"
        lead="Observa la imagen como lo harías normalmente. Cuando termine la cuenta podrás continuar."
        as="h2"
      />

      {failed ? (
        <div className="space-y-3">
          <Alert tone="error">No pudimos cargar la imagen.</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="flex justify-center rounded-lg border border-border bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado */}
          <img
            key={attempt}
            src={piece.url}
            alt="Imagen que debes observar"
            width={piece.width}
            height={piece.height}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="max-h-[65dvh] w-auto max-w-full object-contain"
          />
        </div>
      )}

      {loaded && !done ? (
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-neuro/15">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ width: `${Math.round((1 - remaining / seconds) * 100)}%` }}
          />
        </div>
      ) : null}
      <Button size="lg" className="w-full" disabled={!ready} onClick={onNext}>
        {ready
          ? last
            ? "Continuar"
            : "Siguiente imagen"
          : loaded
            ? `Podrás continuar en ${remaining} s`
            : "Cargando imagen…"}
      </Button>
      <span className="sr-only" role="status">
        {ready ? "Ya puedes continuar" : ""}
      </span>
    </Screen>
  );
}

/**
 * Paso de exposición de una batería: el participante ve las piezas de un estudio de imagen con IA, una
 * por una, un mínimo de segundos cada una, y sigue. No mide la mirada (eso sería eye tracking): sólo
 * garantiza y registra que la persona vio el estímulo antes de la siguiente prueba. En vista previa no
 * guarda nada.
 */
export function ExposureRunner({
  token,
  batterySessionId,
  studyId,
  pieces,
  preview,
  onComplete,
}: {
  token: string;
  batterySessionId: string;
  studyId: string;
  pieces: ExposurePiece[];
  preview: boolean;
  onComplete: () => void;
}) {
  type Stage =
    | { kind: "starting" }
    | { kind: "viewing"; index: number }
    | { kind: "saving" };
  const [stage, setStage] = useState<Stage>({ kind: "starting" });
  const [error, setError] = useState<string | null>(null);
  const exposureSession = useRef<string | null>(null);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    if (!preview) {
      const res = await withRetry(
        () => batteryApi.startExposure(token, batterySessionId, studyId),
        { retries: 2 },
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      exposureSession.current = res.sessionId;
    }
    setStage({ kind: "viewing", index: 0 });
  }, [preview, token, batterySessionId, studyId]);

  useEffect(() => {
    if (startedRef.current || pieces.length === 0) return;
    startedRef.current = true;
    void start();
  }, [start, pieces.length]);

  const finish = useCallback(async () => {
    setStage({ kind: "saving" });
    setError(null);
    if (!preview && exposureSession.current) {
      const res = await withRetry(() =>
        batteryApi.completeExposure(
          token,
          batterySessionId,
          exposureSession.current!,
        ),
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
    }
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [preview, token, batterySessionId, onComplete]);

  if (pieces.length === 0)
    return (
      <StatusScreen icon="alert" title="Este paso no se puede mostrar" role="alert">
        <Alert tone="error">
          Este paso no tiene imágenes que mostrar. Avisa a quien te envió la
          liga.
        </Alert>
      </StatusScreen>
    );

  if (stage.kind === "viewing") {
    return (
      <PieceView
        key={pieces[stage.index]!.id}
        piece={pieces[stage.index]!}
        index={stage.index}
        total={pieces.length}
        seconds={preview ? Math.min(EXPOSURE_SECONDS, 1) : EXPOSURE_SECONDS}
        onNext={() =>
          stage.index + 1 < pieces.length
            ? setStage({ kind: "viewing", index: stage.index + 1 })
            : void finish()
        }
      />
    );
  }

  if (error)
    return (
      <StatusScreen
        icon="alert"
        title="No pudimos continuar"
        role="alert"
        actions={
          <Button
            size="lg"
            onClick={() => void (stage.kind === "saving" ? finish() : start())}
          >
            Reintentar
          </Button>
        }
      >
        <Alert tone="error">{error}</Alert>
      </StatusScreen>
    );

  return (
    <StatusScreen
      icon="refresh"
      title={stage.kind === "saving" ? "Guardando…" : "Preparando…"}
      role="status"
    />
  );
}
