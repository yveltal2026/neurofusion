"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { EmbeddedStep } from "@/lib/embedded-step";
import { withRetry } from "@/tools/iat/runner/api";
import { detectDevice, type DeviceInfo } from "@/tools/iat/runner/device";
import {
  blockInstructions,
  itemsOfBlock,
  validateItems,
  type SurveyAnswers,
  type SurveyConfig,
} from "../engine";
import { surveyApi } from "./api";
import { ItemField } from "./ItemField";

type Stage =
  | { kind: "welcome" }
  | { kind: "block"; index: number }
  | { kind: "submitting" }
  | { kind: "thanks" }
  | { kind: "blocked"; message: string };

/** Códigos de error que cierran el estudio para el participante (no tiene caso reintentar). */
const BLOCKING = [
  "already_participated",
  "closed",
  "full",
  "not_available",
  "invalid_link",
];

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-6 py-10">
      {children}
    </main>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      className="fixed inset-x-0 top-0 z-10 h-1.5 bg-foreground/10"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso"
    >
      <div
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Quita lo que el participante dejó vacío para enviar sólo respuestas reales. */
function cleanAnswers(answers: SurveyAnswers): SurveyAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    ),
  );
}

export function SurveyRunner({
  token,
  config,
  preview,
  embedded,
}: {
  token: string;
  config: SurveyConfig;
  preview: boolean;
  /** Si la encuesta corre como paso de una batería (sin consentimiento ni bienvenida propios). */
  embedded?: EmbeddedStep;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "welcome" });
  const [consent, setConsent] = useState(false);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const topRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);
  const completedRef = useRef(false);

  const blocks = config.blocks;

  // Pre-chequeo: avisa de inmediato si ya participó o la encuesta cerró.
  useEffect(() => {
    if (preview || embedded) return;
    let cancelled = false;
    surveyApi.check(token).then((res) => {
      if (!cancelled && !res.ok && BLOCKING.includes(res.code))
        setStage({ kind: "blocked", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [token, preview, embedded]);

  // Al cambiar de bloque, vuelve al inicio de la página.
  useEffect(() => {
    if (stage.kind === "block")
      topRef.current?.scrollIntoView?.({ block: "start" });
  }, [stage]);

  const start = useCallback(async () => {
    const info = detectDevice();
    setDevice(info);
    setStarting(true);
    setStartError(null);
    if (!preview) {
      const res = await withRetry(
        () => surveyApi.start(token, info, embedded?.batterySessionId),
        { retries: 2 },
      );
      if (!res.ok) {
        setStarting(false);
        if (BLOCKING.includes(res.code))
          setStage({ kind: "blocked", message: res.message });
        else setStartError(res.message);
        return;
      }
      setSessionId(res.sessionId);
    } else {
      setSessionId("preview");
    }
    setStarting(false);
    setStage({ kind: "block", index: 0 });
  }, [preview, token, embedded]);

  // Como paso de una batería no hay bienvenida ni consentimiento propios: empieza sola.
  useEffect(() => {
    if (!embedded || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void start();
  }, [embedded, start]);

  // Como paso de una batería, avisa una sola vez al terminar (las respuestas ya se guardaron).
  useEffect(() => {
    if (stage.kind !== "thanks" || !embedded || completedRef.current) return;
    completedRef.current = true;
    embedded.onComplete();
  }, [stage.kind, embedded]);

  const submit = useCallback(async () => {
    if (!sessionId) return;
    setStage({ kind: "submitting" });
    setSaveError(null);
    if (!preview) {
      const res = await withRetry(() =>
        surveyApi.submit(token, sessionId, cleanAnswers(answers)),
      );
      if (!res.ok) {
        // Si el servidor rechazó los datos, el participante puede corregirlos volviendo al formulario.
        if (res.code === "invalid_data") {
          setStage({ kind: "block", index: blocks.length - 1 });
          setErrors({ _form: res.message });
          return;
        }
        if (BLOCKING.includes(res.code) || res.code === "not_found") {
          setStage({ kind: "blocked", message: res.message });
          return;
        }
        setSaveError(res.message);
        return; // permanece en "submitting" con botón Reintentar
      }
    }
    setStage({ kind: "thanks" });
  }, [sessionId, preview, token, answers, blocks.length]);

  function next(index: number) {
    const block = blocks[index];
    const found = validateItems(itemsOfBlock(config, block.id), answers);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Lleva el foco al primer elemento con error.
      const first = Object.keys(found)[0];
      requestAnimationFrame(() =>
        document
          .getElementById(`${first}-error`)
          ?.scrollIntoView?.({ block: "center" }),
      );
      return;
    }
    if (index + 1 < blocks.length)
      setStage({ kind: "block", index: index + 1 });
    else void submit();
  }

  let body: ReactNode = null;

  if (stage.kind === "welcome" && embedded) {
    body = (
      <Screen>
        <div className="space-y-4 text-center">
          {startError ? (
            <>
              <Alert tone="error">{startError}</Alert>
              <Button onClick={() => void start()}>Reintentar</Button>
            </>
          ) : (
            <p className="text-sm text-muted" role="status">
              Preparando…
            </p>
          )}
        </div>
      </Screen>
    );
  } else if (stage.kind === "welcome") {
    body = (
      <Screen>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {config.title}
          </h1>
          {config.intro ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {config.intro}
            </p>
          ) : null}
          <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed">
            {config.texts.consent}
          </div>
          {startError ? <Alert tone="error">{startError}</Alert> : null}
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            He leído la información y acepto participar de forma voluntaria.
          </label>
          <Button
            className="w-full"
            disabled={!consent || starting}
            onClick={() => void start()}
          >
            {starting ? "Preparando…" : "Comenzar"}
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "block") {
    const block = blocks[stage.index];
    const items = itemsOfBlock(config, block.id);
    const instructions = blockInstructions(block);
    const last = stage.index + 1 === blocks.length;
    body = (
      <Screen>
        <div ref={topRef} className="space-y-6">
          {blocks.length > 1 ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Parte {stage.index + 1} de {blocks.length}
            </p>
          ) : null}
          {instructions ? (
            <p className="text-sm leading-relaxed text-muted">{instructions}</p>
          ) : null}
          {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
          <form
            className="space-y-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              next(stage.index);
            }}
          >
            {items.map((item) => (
              <ItemField
                key={item.id}
                item={item}
                value={answers[item.id]}
                error={errors[item.id]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [item.id]: v }));
                  setErrors((er) => {
                    if (!er[item.id] && !er._form) return er;
                    const rest = { ...er };
                    delete rest[item.id];
                    delete rest._form;
                    return rest;
                  });
                }}
              />
            ))}
            {Object.keys(errors).some((k) => k !== "_form") ? (
              <Alert tone="error">
                Revisa las preguntas marcadas para continuar.
              </Alert>
            ) : null}
            <div className="flex gap-3">
              {stage.index > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setErrors({});
                    setStage({ kind: "block", index: stage.index - 1 });
                  }}
                >
                  Atrás
                </Button>
              ) : null}
              <Button type="submit" className="flex-1">
                {last ? "Enviar respuestas" : "Continuar"}
              </Button>
            </div>
          </form>
        </div>
      </Screen>
    );
  } else if (stage.kind === "submitting") {
    body = (
      <Screen>
        <div className="space-y-4 text-center">
          {saveError ? (
            <>
              <Alert tone="error">{saveError}</Alert>
              <p className="text-sm text-muted">
                Tus respuestas siguen en esta ventana: no la cierres.
              </p>
              <Button onClick={() => void submit()}>Reintentar</Button>
            </>
          ) : (
            <p className="text-sm text-muted" role="status">
              Guardando tus respuestas…
            </p>
          )}
        </div>
      </Screen>
    );
  } else if (stage.kind === "thanks" && embedded) {
    body = (
      <Screen>
        <p className="text-center text-sm text-muted" role="status">
          Continuando…
        </p>
      </Screen>
    );
  } else if (stage.kind === "thanks") {
    body = (
      <Screen>
        <div className="space-y-4 text-center" data-testid="thanks">
          <h2 className="text-2xl font-semibold tracking-tight">¡Gracias!</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {config.texts.thankYou}
          </p>
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

  const progressDone =
    stage.kind === "block"
      ? stage.index
      : stage.kind === "submitting" || stage.kind === "thanks"
        ? blocks.length
        : 0;

  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      data-device={device?.deviceType}
    >
      {preview ? (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">
          Vista previa: no se guarda ningún dato.
        </div>
      ) : null}
      {stage.kind === "block" || stage.kind === "submitting" ? (
        <ProgressBar done={progressDone} total={blocks.length} />
      ) : null}
      {body}
    </div>
  );
}
