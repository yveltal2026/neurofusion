"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ConsentCheck,
  FactList,
  ParticipantScreen,
  Prose,
  ReadingPanel,
  ScreenHeader,
  Section,
  StatusScreen,
} from "@/components/participant";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withRetry } from "@/tools/iat/runner/api";
import { detectDevice } from "@/tools/iat/runner/device";
import { Runner } from "@/tools/iat/runner/Runner";
import { SurveyRunner } from "@/tools/survey/runner/SurveyRunner";
import { VariantRunner } from "@/tools/variants/runner/VariantRunner";
import {
  isBatteryComplete,
  nextStep,
  type BatteryConfig,
  type StepProgress,
} from "../engine";
import type { StepLink } from "../participant";
import { batteryApi } from "./api";
import { ExposureRunner } from "./ExposureRunner";
import dynamic from "next/dynamic";

const EyeTrackingLab = dynamic(() => import("@/lab/eyetracking/EyeTrackingLab").then((m) => m.EyeTrackingLab), { ssr: false });

type Stage =
  | { kind: "welcome" }
  | { kind: "running" }
  | { kind: "syncing" }
  | { kind: "thanks" }
  | { kind: "blocked"; message: string };

/** Códigos que cierran la batería para el participante (no tiene caso reintentar). */
const BLOCKING = [
  "already_participated",
  "closed",
  "full",
  "not_available",
  "invalid_link",
  "not_found",
];

function Screen({ children }: { children: ReactNode }) {
  return <ParticipantScreen>{children}</ParticipantScreen>;
}

/**
 * Recorre los pasos de una batería con una sola liga: consentimiento único → cada paso en su orden
 * → agradecimiento. El estado de cada paso viene SIEMPRE del servidor (se deriva de las sesiones de
 * los pasos); la reanudación tras recargar la página retoma en el primer paso sin completar.
 * En vista previa recorre los pasos sin guardar nada.
 */
export function BatteryRunner({
  token,
  config,
  preview,
  previewSteps,
}: {
  token: string;
  config: BatteryConfig;
  preview: boolean;
  /** Sólo en vista previa: pasos activos, tal como los deja el investigador. */
  previewSteps?: StepLink[];
}) {
  const [stage, setStage] = useState<Stage>({ kind: "welcome" });
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepLink[]>([]);
  const [progress, setProgress] = useState<StepProgress[]>([]);

  // Pre-chequeo: avisa de inmediato si ya participó o la batería cerró.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    batteryApi.check(token).then((res) => {
      if (!cancelled && !res.ok && BLOCKING.includes(res.code))
        setStage({ kind: "blocked", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [token, preview]);

  const finish = useCallback(
    async (id: string) => {
      setStage({ kind: "syncing" });
      setSyncError(null);
      if (!preview) {
        const res = await withRetry(() => batteryApi.complete(token, id));
        if (!res.ok) {
          setSyncError(res.message);
          return;
        }
      }
      setStage({ kind: "thanks" });
    },
    [preview, token],
  );

  const start = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    if (preview) {
      setSessionId("preview");
      setSteps(previewSteps ?? []);
      setProgress(
        (previewSteps ?? []).map((s) => ({
          studyId: s.studyId,
          status: "pending",
        })),
      );
      setStarting(false);
      setStage(
        (previewSteps ?? []).length
          ? { kind: "running" }
          : {
              kind: "blocked",
              message: "Esta batería no tiene pasos activos.",
            },
      );
      return;
    }
    const res = await withRetry(
      () => batteryApi.start(token, detectDevice().deviceType),
      { retries: 2 },
    );
    setStarting(false);
    if (!res.ok) {
      if (BLOCKING.includes(res.code))
        setStage({ kind: "blocked", message: res.message });
      else setStartError(res.message);
      return;
    }
    setSessionId(res.sessionId);
    setSteps(res.steps);
    setProgress(res.progress);
    if (res.complete || isBatteryComplete(res.progress))
      void finish(res.sessionId);
    else setStage({ kind: "running" });
  }, [preview, previewSteps, token, finish]);

  /** Un paso terminó: confirma con el servidor cuál sigue (o cierra la batería si ya no falta ninguno). */
  const advance = useCallback(
    async (studyId: string) => {
      if (!sessionId) return;
      if (preview) {
        const next = progress.map((p) =>
          p.studyId === studyId ? { ...p, status: "completed" as const } : p,
        );
        setProgress(next);
        if (isBatteryComplete(next)) void finish(sessionId);
        return;
      }
      setStage({ kind: "syncing" });
      setSyncError(null);
      const res = await withRetry(() => batteryApi.progress(token, sessionId));
      if (!res.ok) {
        setSyncError(res.message);
        return;
      }
      setProgress(res.progress);
      if (res.complete || isBatteryComplete(res.progress))
        void finish(sessionId);
      else setStage({ kind: "running" });
    },
    [sessionId, preview, progress, token, finish],
  );

  let body: ReactNode = null;

  if (stage.kind === "welcome") {
    body = (
      <Screen>
        <ScreenHeader
          icon="layers"
          title={config.title}
          lead={config.intro ? <Prose text={config.intro} size="lg" /> : undefined}
        />
        <Section title="Antes de empezar">
          <FactList
            items={[
              { icon: "layers", text: "Harás varias actividades, una tras otra. Te avisamos en cuál vas." },
              { icon: "refresh", text: "Si recargas la página, retomas donde ibas." },
            ]}
          />
        </Section>
        <Section icon="lock" title="Consentimiento informado">
          <ReadingPanel>
            <Prose text={config.texts.consent} />
          </ReadingPanel>
        </Section>
        <div className="space-y-4">
          {startError ? <Alert tone="error">{startError}</Alert> : null}
          <ConsentCheck checked={consent} onChange={setConsent}>
            He leído la información y acepto participar de forma voluntaria.
          </ConsentCheck>
          <Button
            size="lg"
            className="w-full"
            disabled={!consent || starting}
            onClick={() => void start()}
          >
            {starting ? "Preparando…" : "Comenzar"}
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "running") {
    const current = nextStep(progress);
    const step = current
      ? steps.find((s) => s.studyId === current.studyId)
      : undefined;
    if (!current || !step || !sessionId) {
      body = (
        <StatusScreen icon="alert" title="No pudimos preparar el siguiente paso" role="alert">
          <Alert tone="error">
            No pudimos preparar el siguiente paso. Recarga la página para
            continuar.
          </Alert>
        </StatusScreen>
      );
    } else {
      const embedded = {
        batterySessionId: sessionId,
        onComplete: () => void advance(step.studyId),
      };
      const position = steps.findIndex((s) => s.studyId === step.studyId) + 1;
      body = (
        <>
          {step.tool === "iat" ? (
            <Runner
              key={step.studyId}
              token={step.token}
              config={step.config}
              preview={preview}
              embedded={embedded}
            />
          ) : step.tool === "iat_variant" ? (
            <VariantRunner
              key={step.studyId}
              token={step.token}
              config={step.config}
              preview={preview}
              embedded={embedded}
            />
          ) : step.tool === "eyetracking" ? (
            <EyeTrackingLab key={step.studyId} study={{ token: step.token, title: step.title, assets: step.pieces, durationSeconds: step.durationSeconds, preview, batterySessionId: sessionId, onComplete: embedded.onComplete }} />
          ) : step.tool === "visual" ? (
            <ExposureRunner
              key={step.studyId}
              token={token}
              batterySessionId={sessionId}
              studyId={step.studyId}
              pieces={step.pieces}
              preview={preview}
              onComplete={embedded.onComplete}
            />
          ) : (
            <SurveyRunner
              key={step.studyId}
              token={step.token}
              config={step.config}
              preview={preview}
              embedded={embedded}
            />
          )}
          {steps.length > 1 ? (
            <div
              className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center"
              role="status"
              aria-label={`Paso ${position} de ${steps.length}`}
            >
              <span className="rounded-full border border-border bg-surface/95 px-4 py-1.5 font-display text-sm font-semibold text-heading shadow-sm">
                Paso {position} de {steps.length}
              </span>
            </div>
          ) : null}
        </>
      );
    }
  } else if (stage.kind === "syncing") {
    body = syncError ? (
      <StatusScreen
        icon="alert"
        title="No pudimos continuar"
        role="alert"
        actions={
          <Button
            size="lg"
            onClick={() => {
              const current = nextStep(progress);
              if (sessionId && (!current || isBatteryComplete(progress)))
                void finish(sessionId);
              else if (sessionId) void advance(current?.studyId ?? "");
            }}
          >
            Reintentar
          </Button>
        }
      >
        <Alert tone="error">{syncError}</Alert>
        <p className="text-muted">
          Tus respuestas ya se guardaron; sólo falta continuar.
        </p>
      </StatusScreen>
    ) : (
      <StatusScreen icon="refresh" title="Guardando…" role="status" />
    );
  } else if (stage.kind === "thanks") {
    body = (
      <StatusScreen icon="check" title="¡Gracias!" testId="thanks">
        <Prose text={config.texts.thankYou} />
      </StatusScreen>
    );
  } else if (stage.kind === "blocked") {
    body = (
      <StatusScreen icon="ban" title="No podemos abrir este estudio">
        <p data-testid="blocked">{stage.message}</p>
      </StatusScreen>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {preview ? (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">
          Vista previa: no se guarda ningún dato.
        </div>
      ) : null}
      {body}
    </div>
  );
}
