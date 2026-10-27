"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withRetry } from "@/tools/iat/runner/api";
import { EXPOSURE_SECONDS } from "../engine";
import type { ExposurePiece } from "../participant";
import { batteryApi } from "./api";

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-5 px-6 py-8">
      {children}
    </main>
  );
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
      <div className="space-y-1">
        {total > 1 ? (
          <p className="text-sm text-muted">
            Imagen {index + 1} de {total}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight">
          Mira con atención
        </h2>
        <p className="text-sm text-muted">
          Observa la imagen como lo harías normalmente. Cuando termine la cuenta
          podrás continuar.
        </p>
      </div>

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

      <Button className="w-full" disabled={!ready} onClick={onNext}>
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
      <Screen>
        <Alert tone="error">
          Este paso no tiene imágenes que mostrar. Avisa a quien te envió la
          liga.
        </Alert>
      </Screen>
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

  return (
    <Screen>
      <div className="space-y-4 text-center">
        {error ? (
          <>
            <Alert tone="error">{error}</Alert>
            <Button
              onClick={() =>
                void (stage.kind === "saving" ? finish() : start())
              }
            >
              Reintentar
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted" role="status">
            {stage.kind === "saving" ? "Guardando…" : "Preparando…"}
          </p>
        )}
      </div>
    </Screen>
  );
}
