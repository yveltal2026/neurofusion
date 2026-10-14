"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { withRetry } from "@/tools/iat/runner/api";
import { detectDevice } from "@/tools/iat/runner/device";
import { Runner } from "@/tools/iat/runner/Runner";
import { SurveyRunner } from "@/tools/survey/runner/SurveyRunner";
import type { BatteryConfig } from "../engine/config";
import type { BatteryStep } from "../server";
import { batteryApi } from "./api";

/** Cualquiera de estos códigos termina la sesión con un mensaje (no hay nada que reintentar). */
const BLOCKING = ["already_participated", "closed", "full", "not_available", "invalid_link"];

type Stage =
  | { kind: "loading" }
  | { kind: "welcome" }
  | { kind: "between"; index: number }
  | { kind: "step"; index: number }
  | { kind: "completing" }
  | { kind: "thanks" }
  | { kind: "blocked"; message: string };

const TOOL_LABEL = { iat: "Test de asociación", survey: "Encuesta" } as const;

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center px-6 py-10">{children}</main>
  );
}

/**
 * Corre una batería: consentimiento → paso 1 → paso 2 → … → gracias. Cada paso es un estudio completo
 * (IAT o encuesta) en modo incrustado. El avance real lo decide el servidor: al recargar, `progress`
 * devuelve el primer paso sin completar y se retoma ahí (un IAT interrumpido se reinicia, como siempre).
 */
export function BatteryRunner({
  token,
  name,
  config,
  steps,
  preview,
}: {
  token: string;
  name: string;
  config: BatteryConfig;
  steps: BatteryStep[];
  preview: boolean;
}) {
  const [stage, setStage] = useState<Stage>(preview ? { kind: "welcome" } : { kind: "loading" });
  const [consent, setConsent] = useState(false);
  const [batterySessionId, setBatterySessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  const total = steps.length;

  // Al abrir (o recargar): si ya hay sesión en curso, retoma en el primer paso incompleto.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    batteryApi.progress(token).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // Sin sesión previa (not_found) es lo normal: se muestra la bienvenida. Si la batería no está disponible, se avisa de inmediato.
        setStage(BLOCKING.includes(res.code) ? { kind: "blocked", message: res.message } : { kind: "welcome" });
        return;
      }
      setBatterySessionId(res.batterySessionId);
      if (res.sessionStatus === "completed") setStage({ kind: "thanks" });
      else if (res.sessionStatus === "started" && res.nextIndex !== null) setStage({ kind: "between", index: res.nextIndex });
      else setStage({ kind: "welcome" });
    });
    return () => {
      cancelled = true;
    };
  }, [token, preview]);

  const begin = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    if (!preview) {
      const res = await withRetry(() => batteryApi.start(token, detectDevice().deviceType), { retries: 2 });
      if (!res.ok) {
        setStarting(false);
        if (BLOCKING.includes(res.code)) setStage({ kind: "blocked", message: res.message });
        else setStartError(res.message);
        return;
      }
      setBatterySessionId(res.batterySessionId);
    } else {
      setBatterySessionId("preview");
    }
    setStarting(false);
    setStage({ kind: "between", index: 0 });
  }, [preview, token]);

  const finish = useCallback(async () => {
    setStage({ kind: "completing" });
    setFinishError(null);
    if (!preview) {
      const res = await withRetry(() => batteryApi.complete(token));
      if (!res.ok) {
        setFinishError(res.message);
        return; // permanece en "completing" con botón Reintentar
      }
    }
    setStage({ kind: "thanks" });
  }, [preview, token]);

  const onStepDone = useCallback(
    (index: number) => {
      if (index + 1 < total) setStage({ kind: "between", index: index + 1 });
      else void finish();
    },
    [total, finish],
  );

  let body: ReactNode = null;

  if (stage.kind === "loading") {
    body = (
      <Screen>
        <p className="text-center text-sm text-muted" role="status">
          Cargando…
        </p>
      </Screen>
    );
  } else if (stage.kind === "welcome") {
    body = (
      <Screen>
        <div className="space-y-6">
          <IconTile name="layers" />
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed">{config.texts.consent}</div>
          <ol className="space-y-1 text-sm text-muted" aria-label="Actividades">
            {steps.map((s, i) => (
              <li key={s.studyId}>
                {i + 1}. {TOOL_LABEL[s.tool]}
              </li>
            ))}
          </ol>
          {startError ? <Alert tone="error">{startError}</Alert> : null}
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            He leído la información y acepto participar de forma voluntaria.
          </label>
          <Button className="w-full" disabled={!consent || starting} onClick={() => void begin()}>
            {starting ? "Preparando…" : "Comenzar"}
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "between") {
    const step = steps[stage.index]!;
    body = (
      <Screen>
        <div className="space-y-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Actividad {stage.index + 1} de {total}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{TOOL_LABEL[step.tool]}</h2>
          <p className="text-sm text-muted">
            {step.tool === "iat"
              ? "Responderás con rapidez a palabras que aparecen en pantalla. Se te explica cómo antes de empezar."
              : "Responderás algunas preguntas. No hay respuestas correctas o incorrectas."}
          </p>
          <Button className="w-full" autoFocus onClick={() => setStage({ kind: "step", index: stage.index })}>
            Continuar
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "step") {
    const step = steps[stage.index]!;
    const embedded = { batterySessionId: batterySessionId ?? "preview", onComplete: () => onStepDone(stage.index) };
    // `key` fuerza un runner nuevo por paso: ninguno hereda estado del anterior.
    body =
      step.tool === "iat" ? (
        <Runner key={step.studyId} token={step.token} config={step.config} preview={preview} embedded={embedded} />
      ) : (
        <SurveyRunner key={step.studyId} token={step.token} config={step.config} preview={preview} embedded={embedded} />
      );
  } else if (stage.kind === "completing") {
    body = (
      <Screen>
        <div className="space-y-4 text-center">
          {finishError ? (
            <>
              <Alert tone="error">{finishError}</Alert>
              <p className="text-sm text-muted">Tus respuestas siguen guardadas: no cierres esta ventana.</p>
              <Button onClick={() => void finish()}>Reintentar</Button>
            </>
          ) : (
            <p className="text-sm text-muted" role="status">
              Terminando…
            </p>
          )}
        </div>
      </Screen>
    );
  } else if (stage.kind === "thanks") {
    body = (
      <Screen>
        <div className="flex flex-col items-center space-y-4 text-center" data-testid="thanks">
          <IconTile name="check" size="lg" />
          <h2 className="text-2xl font-semibold tracking-tight">¡Gracias!</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{config.texts.thankYou}</p>
        </div>
      </Screen>
    );
  } else if (stage.kind === "blocked") {
    body = (
      <Screen>
        <div className="space-y-4 text-center" data-testid="blocked">
          <p className="text-base">{stage.message}</p>
        </div>
      </Screen>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {preview ? (
        <div className="bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-warning">Vista previa: no se guarda ningún dato.</div>
      ) : null}
      {body}
    </div>
  );
}
