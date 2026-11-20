"use client";

import { useRef, useState } from "react";
import {
  ConsentCheck,
  ParticipantScreen,
  ScreenHeader,
  StatusScreen,
} from "@/components/participant";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WebEyetrackingConfig } from "../config";
import type { WebStepEvent } from "../engine/metrics";
import type { RawWebGazeSample } from "../engine/normalize";

export function WebEyeParticipantRunner({
  token,
  studyName,
  config,
  preview,
  done,
}: {
  token: string;
  studyName: string;
  config: WebEyetrackingConfig;
  preview: boolean;
  done: boolean;
}) {
  const [phase, setPhase] = useState<"consent" | "running" | "done">(
    done ? "done" : "consent",
  );
  const [accepted, setAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const eventsRef = useRef<WebStepEvent[]>([]);
  const samplesRef = useRef<RawWebGazeSample[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (phase === "done") {
    return (
      <StatusScreen icon="check" title="¡Gracias por participar!">
        <p>Tu recorrido web quedó registrado correctamente.</p>
      </StatusScreen>
    );
  }

  const handleStart = async () => {
    setError(null);
    if (config.mode === "live_snippet") {
      if (preview) {
        setPhase("running");
        return;
      }
      const url = new URL(config.targetUrl);
      url.searchParams.set("nf_token", token);
      window.location.href = url.toString();
      return;
    }

    if (preview) {
      startedAtRef.current = Date.now();
      eventsRef.current = [
        {
          stepId: config.steps[0].id,
          startedAtMs: 0,
          completedAtMs: null,
          completed: false,
          trigger: "manual",
        },
      ];
      setPhase("running");
      return;
    }

    const res = await fetch(`/api/s/${token}/web-eyetrack/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        deviceType: window.innerWidth < 768 ? "mobile" : "desktop",
      }),
    });
    if (!res.ok) {
      setError("No se pudo iniciar la sesión. Intenta de nuevo.");
      return;
    }
    const data = (await res.json()) as { sessionId: string };
    setSessionId(data.sessionId);
    startedAtRef.current = Date.now();
    eventsRef.current = [
      {
        stepId: config.steps[0].id,
        startedAtMs: 0,
        completedAtMs: null,
        completed: false,
        trigger: "manual",
      },
    ];
    setPhase("running");
  };

  if (phase === "consent") {
    return (
      <ParticipantScreen>
        <div className="space-y-4 text-sm">
          <ScreenHeader
            title={studyName}
            eyebrow={preview ? "Vista previa (sin guardar datos)" : undefined}
          />
          <p>
            Evaluarás <strong>{config.targetUrl}</strong> siguiendo{" "}
            {config.steps.length} paso(s) breves. No se almacena video de tu
            cámara ni datos personales.
          </p>
          <ConsentCheck checked={accepted} onChange={setAccepted}>
            Acepto participar en esta evaluación de usabilidad web.
          </ConsentCheck>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="button" disabled={!accepted} onClick={handleStart}>
            Comenzar estudio
          </Button>
        </div>
      </ParticipantScreen>
    );
  }

  const step = config.steps[stepIndex];
  if (!step) return null;

  const recordSample = (
    kind: "gaze" | "click",
    clientX: number,
    clientY: number,
  ) => {
    const vw = Math.max(window.innerWidth, 100);
    const vh = Math.max(window.innerHeight, 100);
    const el = containerRef.current;
    const scrollY = el ? el.scrollTop : window.scrollY;
    const docH = el ? Math.max(el.scrollHeight, vh) : vh;
    samplesRef.current.push({
      t: Math.max(0, Date.now() - startedAtRef.current),
      x: Math.max(0, Math.min(1, clientX / vw)),
      y: Math.max(0, Math.min(1, clientY / vh)),
      scrollX: 0,
      scrollY: Math.max(0, scrollY),
      vw,
      vh,
      docW: vw,
      docH,
      stepId: step.id,
      kind,
    });
  };

  const advance = async () => {
    const now = Math.max(0, Date.now() - startedAtRef.current);
    const currentEv = eventsRef.current[stepIndex];
    if (currentEv) {
      currentEv.completedAtMs = now;
      currentEv.completed = true;
      currentEv.trigger = "manual";
    }
    if (stepIndex + 1 >= config.steps.length) {
      if (!preview && sessionId) {
        await fetch(`/api/s/${token}/web-eyetrack/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            stepEvents: eventsRef.current,
            samples: samplesRef.current.slice(0, 2000),
            final: true,
          }),
        });
      }
      setPhase("done");
      return;
    }
    const nextIdx = stepIndex + 1;
    eventsRef.current.push({
      stepId: config.steps[nextIdx].id,
      startedAtMs: now,
      completedAtMs: null,
      completed: false,
      trigger: "manual",
    });
    setStepIndex(nextIdx);
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-4xl space-y-4 p-4"
      onMouseMove={(e) => recordSample("gaze", e.clientX, e.clientY)}
      onClick={(e) => recordSample("click", e.clientX, e.clientY)}
    >
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">
            Paso {stepIndex + 1} de {config.steps.length} · {step.title}
          </p>
          <p className="mt-1 text-sm">{step.instruction}</p>
        </div>
        <Button type="button" onClick={advance}>
          {stepIndex + 1 >= config.steps.length
            ? "Finalizar"
            : "Siguiente paso"}
        </Button>
      </Card>

      <Card className="min-h-[420px] space-y-2 text-sm text-muted">
        <p className="font-medium text-heading">
          Sitio evaluado: {config.targetUrl}
        </p>
        <p>
          {config.mode === "live_snippet"
            ? "Vista previa: en producción, el participante es redirigido al sitio real con el snippet instalado en <head>."
            : "Desplázate verticalmente para explorar la pantalla y pulsa Siguiente paso cuando completes la instrucción."}
        </p>
      </Card>
    </div>
  );
}
