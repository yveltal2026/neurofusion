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
import {
  Callout,
  ConsentCheck,
  FactList,
  ParticipantScreen,
  Prose,
  QuestionCard,
  ReadingPanel,
  ScreenHeader,
  Section,
  StatusScreen,
} from "@/components/participant";
import type { EmbeddedStep } from "@/lib/embedded-step";
import { withRetry } from "@/tools/iat/runner/api";
import { detectDevice, type DeviceInfo } from "@/tools/iat/runner/device";
import {
  blockInstructions,
  groupBipolar,
  itemsOfBlock,
  listItems,
  validateItems,
  type SurveyAnswers,
  type SurveyConfig,
} from "../engine";
import { surveyApi } from "./api";
import { BipolarGroup, ItemField } from "./ItemField";
import { QuestionImage } from "./QuestionImage";

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
  return <ParticipantScreen>{children}</ParticipantScreen>;
}

/**
 * Título neutro de cada parte. No se muestra el nombre del instrumento (SUS, NPS…): nombrarlo
 * condicionaría la respuesta, y cada instrumento ya trae su indicación sin revelarlo.
 */
const BLOCK_TITLE = {
  questions: "Cuéntanos sobre ti",
  instrument: "Tu opinión",
  price: "Sobre el precio",
} as const;

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      className="fixed inset-x-0 top-0 z-10 h-2 bg-neuro/15"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso"
    >
      <div
        className="h-full rounded-r-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
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
  // Estimado: unos 15 segundos por elemento, mínimo un minuto.
  const minutes = Math.max(1, Math.round(listItems(config).length / 4));

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
        <ScreenHeader
          icon="survey"
          title={config.title}
          lead={config.intro ? <Prose text={config.intro} size="lg" /> : undefined}
        />
        <Section title="Antes de empezar">
          <FactList
            items={[
              {
                icon: "clock",
                text: `${blocks.length === 1 ? "Es una sola parte" : `Son ${blocks.length} partes`} y toma unos ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
              },
              {
                icon: "check",
                text: "No hay respuestas correctas ni incorrectas: queremos tu opinión sincera.",
              },
              {
                icon: "device",
                text: "Puedes responder desde tu celular o tu computadora, sin ayuda de nadie.",
              },
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
  } else if (stage.kind === "block") {
    const block = blocks[stage.index];
    const items = itemsOfBlock(config, block.id);
    const instructions = blockInstructions(block);
    const last = stage.index + 1 === blocks.length;
    const groups = groupBipolar(items);
    body = (
      <Screen>
        <div ref={topRef} className="space-y-8">
          <ScreenHeader
            eyebrow={
              blocks.length > 1
                ? `Parte ${stage.index + 1} de ${blocks.length}`
                : undefined
            }
            title={BLOCK_TITLE[block.kind]}
          />
          {instructions ? (
            <Callout title="Cómo responder">{instructions}</Callout>
          ) : null}
          {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              next(stage.index);
            }}
          >
            {groups.map((group, gi) => {
              const number = groups.length > 1 ? gi + 1 : undefined;
              const clear = (ids: string[]) =>
                setErrors((er) => {
                  if (!ids.some((id) => er[id]) && !er._form) return er;
                  const rest = { ...er };
                  for (const id of ids) delete rest[id];
                  delete rest._form;
                  return rest;
                });
              if (group.length > 1)
                return (
                  <QuestionCard key={group[0]!.id} number={number}>
                    {group[0]!.image ? <QuestionImage src={`/api/s/${token}/survey/images/${group[0]!.id}`} alt={group[0]!.image.alt} /> : null}
                    <BipolarGroup
                      items={
                        group as Extract<
                          (typeof group)[number],
                          { type: "scale" }
                        >[]
                      }
                      values={answers}
                      errors={errors}
                      onChange={(id, v) => {
                        setAnswers((a) => ({ ...a, [id]: v }));
                        clear([id]);
                      }}
                    />
                  </QuestionCard>
                );
              const item = group[0]!;
              return (
                <QuestionCard key={item.id} number={number}>
                  {item.image ? <QuestionImage src={`/api/s/${token}/survey/images/${item.id}`} alt={item.image.alt} /> : null}
                  <ItemField
                    item={item}
                    value={answers[item.id]}
                    error={errors[item.id]}
                    onChange={(v) => {
                      setAnswers((a) => ({ ...a, [item.id]: v }));
                      clear([item.id]);
                    }}
                  />
                </QuestionCard>
              );
            })}
            {Object.keys(errors).some((k) => k !== "_form") ? (
              <Alert tone="error">
                Revisa las preguntas marcadas para continuar.
              </Alert>
            ) : null}
            <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-border bg-background/95 px-6 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2 sm:backdrop-blur-none">
              {stage.index > 0 ? (
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    setErrors({});
                    setStage({ kind: "block", index: stage.index - 1 });
                  }}
                >
                  Atrás
                </Button>
              ) : null}
              <Button type="submit" size="lg" className="flex-1">
                {last ? "Enviar respuestas" : "Continuar"}
              </Button>
            </div>
          </form>
        </div>
      </Screen>
    );
  } else if (stage.kind === "submitting") {
    body = saveError ? (
      <StatusScreen
        icon="alert"
        title="No pudimos guardar tus respuestas"
        role="alert"
        actions={<Button size="lg" onClick={() => void submit()}>Reintentar</Button>}
      >
        <Alert tone="error">{saveError}</Alert>
        <p className="text-muted">
          Tus respuestas siguen en esta ventana: no la cierres.
        </p>
      </StatusScreen>
    ) : (
      <StatusScreen icon="refresh" title="Guardando tus respuestas…" role="status" />
    );
  } else if (stage.kind === "thanks" && embedded) {
    body = (
      <Screen>
        <p className="text-center text-base text-muted" role="status">
          Continuando…
        </p>
      </Screen>
    );
  } else if (stage.kind === "thanks") {
    body = (
      <StatusScreen icon="check" title="¡Gracias!" testId="thanks">
        <Prose text={config.texts.thankYou} />
      </StatusScreen>
    );
  } else if (stage.kind === "blocked") {
    body = (
      <StatusScreen icon="ban" title="No podemos abrir esta encuesta">
        <p data-testid="blocked">{stage.message}</p>
      </StatusScreen>
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
