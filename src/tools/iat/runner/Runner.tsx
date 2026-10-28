"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Callout, ConsentCheck, FactList, ParticipantScreen, Prose, ReadingPanel, ScreenHeader, Section, StatusScreen } from "@/components/participant";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { EmbeddedStep } from "@/lib/embedded-step";
import type { IatConfig } from "../config";
import { estimateMinutes } from "../engine/protocol";
import { cryptoRng } from "../engine/rng";
import type { PlannedBlock } from "../engine/types";
import { newCounterbalance, planForDimension, type SubmittedTrial } from "../session";
import { participantApi, withRetry } from "./api";
import { BlockRunner } from "./BlockRunner";
import { detectDevice, type DeviceInfo } from "./device";
import { blockIntro, categoryLabels, readableOn } from "./labels";
import { ParticipantForm } from "./ParticipantForm";

type Stage =
  | { kind: "welcome" }
  | { kind: "form" }
  | { kind: "device-notice" }
  | { kind: "intro" }
  | { kind: "dimension-intro"; dim: number }
  | { kind: "block-intro"; dim: number; block: number }
  | { kind: "block"; dim: number; block: number }
  | { kind: "saving"; dim: number }
  | { kind: "thanks" }
  | { kind: "blocked"; message: string };

interface Session {
  id: string;
  plans: PlannedBlock[][];
}

// Paleta neutra: las pantallas de texto usan el kit del participante pero sin la marca, para no sesgar la percepción.
function Screen({ children }: { children: ReactNode }) {
  return <ParticipantScreen brand={false}>{children}</ParticipantScreen>;
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="fixed inset-x-0 top-0 z-10 h-1.5 bg-foreground/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso">
      <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Runner({ token, config, preview, embedded }: { token: string; config: IatConfig; preview: boolean; embedded?: EmbeddedStep }) {
  // Como paso de una batería no hay bienvenida ni consentimiento propios: empieza en el formulario.
  // (Sólo se monta en el navegador, después de que el participante inicia la batería.)
  const [stage, setStage] = useState<Stage>(embedded ? { kind: "form" } : { kind: "welcome" });
  const [consent, setConsent] = useState(false);
  const [device, setDevice] = useState<DeviceInfo | null>(() => (embedded ? detectDevice() : null));
  const completedRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [doneTrials, setDoneTrials] = useState(0);
  const recordsRef = useRef<SubmittedTrial[][]>([]);

  const nDims = config.dimensions.length;
  const totalTrials = session ? session.plans.reduce((n, dim) => n + dim.reduce((m, b) => m + b.trials.length, 0), 0) : 0;
  const blockCount = session?.plans[0]?.length ?? 0;

  // Pre-chequeo: avisa de inmediato si ya participó o el estudio cerró.
  useEffect(() => {
    if (preview || embedded) return;
    let cancelled = false;
    participantApi.check(token).then((res) => {
      if (!cancelled && !res.ok && ["already_participated", "closed", "full", "not_available", "invalid_link"].includes(res.code)) {
        setStage({ kind: "blocked", message: res.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, preview, embedded]);

  // Como paso de una batería, avisa una sola vez al terminar (los datos ya se guardaron en "saving").
  useEffect(() => {
    if (stage.kind !== "thanks" || !embedded || completedRef.current) return;
    completedRef.current = true;
    embedded.onComplete();
  }, [stage.kind, embedded]);

  // Bloquea el scroll mientras se responde el test.
  const running = stage.kind === "block";
  useEffect(() => {
    if (!running) return;
    const { overflow, overscrollBehavior } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.documentElement.style.overflow = overflow;
      document.documentElement.style.overscrollBehavior = overscrollBehavior;
    };
  }, [running]);

  // Espacio / Enter inicia el bloque cuando se está en la pantalla de instrucciones (teclado).
  const startKeyTarget = stage.kind === "block-intro" && device?.inputMode === "keyboard" ? stage : null;
  useEffect(() => {
    if (!startKeyTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setStage({ kind: "block", dim: startKeyTarget.dim, block: startKeyTarget.block });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startKeyTarget]);

  const start = useCallback(
    async (participant: Record<string, unknown>) => {
      if (!device) return;
      setStarting(true);
      setFormError(null);

      let id = "preview";
      let counterbalance = newCounterbalance(nDims, cryptoRng());
      if (!preview) {
        const res = await withRetry(() => participantApi.start(token, participant, device, embedded?.batterySessionId), { retries: 2 });
        if (!res.ok) {
          setStarting(false);
          if (["already_participated", "closed", "full", "not_available", "invalid_link"].includes(res.code)) {
            setStage({ kind: "blocked", message: res.message });
          } else {
            setFormError(res.message);
          }
          return;
        }
        id = res.sessionId;
        counterbalance = res.counterbalance;
      }
      const plans = config.dimensions.map((_, i) => planForDimension(config, i, counterbalance[i]));
      recordsRef.current = plans.map(() => []);
      setSession({ id, plans });
      setStarting(false);
      setStage(device.inputMode === "touch" ? { kind: "device-notice" } : { kind: "intro" });
    },
    [device, nDims, preview, token, config, embedded],
  );

  const finishDimension = useCallback(
    async (dim: number) => {
      if (!session) return;
      setStage({ kind: "saving", dim });
      setSaveError(null);
      if (!preview) {
        const sent = await withRetry(() => participantApi.sendTrials(token, session.id, dim, recordsRef.current[dim]));
        if (!sent.ok) {
          setSaveError(sent.message);
          return; // permanece en "saving" con botón Reintentar
        }
      }
      if (dim + 1 < nDims) {
        setStage({ kind: "dimension-intro", dim: dim + 1 });
        return;
      }
      if (!preview) {
        const done = await withRetry(() => participantApi.complete(token, session.id));
        if (!done.ok) {
          setSaveError(done.message);
          return;
        }
      }
      setStage({ kind: "thanks" });
    },
    [session, preview, token, nDims],
  );

  const onBlockDone = useCallback(
    (dim: number, blockIdx: number, records: SubmittedTrial[]) => {
      recordsRef.current[dim].push(...records);
      if (!session) return;
      if (blockIdx + 1 < session.plans[dim].length) {
        setStage({ kind: "block-intro", dim, block: blockIdx + 1 });
      } else {
        void finishDimension(dim);
      }
    },
    [session, finishDimension],
  );

  // Modo neutro: el acento es el color de texto de la marca (teal / crema), no el morado de acción (la pantalla del
  // participante es la más calmada). BlockRunner pinta con `text-primary` los estímulos de concepto; el acento por
  // defecto no debe competir con ellos. Los tokens de Neuro también se neutralizan para que el kit no tiña el estudio.
  const accent = config.theme.mode === "custom" && config.theme.accent ? config.theme.accent : null;
  const theme: CSSProperties = accent
    ? ({
        "--primary": accent,
        "--primary-foreground": readableOn(accent),
        "--neuro": accent,
        "--neuro-soft": accent,
        "--neuro-ink": "var(--heading)",
        "--focus": "var(--heading)",
        "--control": "var(--muted)",
      } as CSSProperties)
    : ({
        "--primary": "var(--heading)",
        "--primary-foreground": "var(--background)",
        "--neuro": "var(--heading)",
        "--neuro-soft": "var(--heading)",
        "--neuro-ink": "var(--heading)",
        "--focus": "var(--heading)",
        "--control": "var(--muted)",
      } as CSSProperties);

  let body: ReactNode = null;

  if (stage.kind === "welcome") {
    const minutes = estimateMinutes(config.protocol, nDims);
    body = (
      <Screen>
        <ScreenHeader icon="neuro" title={`Estudio sobre ${config.product}`} />
        <Section title="Qué vas a hacer">
          <FactList
            items={[
              { icon: "clock", text: `Dura unos ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` },
              { icon: "bolt", text: "Clasificarás palabras lo más rápido que puedas." },
              { icon: "device", text: "Funciona mejor en una computadora con teclado; también puedes usar el celular." },
            ]}
          />
        </Section>
        <Section icon="lock" title="Consentimiento informado">
          <ReadingPanel>
            <Prose text={config.texts.consent} />
          </ReadingPanel>
        </Section>
        <div className="space-y-4">
          <ConsentCheck checked={consent} onChange={setConsent}>
            He leído la información y acepto participar de forma voluntaria.
          </ConsentCheck>
          <Button
            size="lg"
            className="w-full"
            disabled={!consent}
            onClick={() => {
              setDevice(detectDevice());
              setStage({ kind: "form" });
            }}
          >
            Comenzar
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "form") {
    body = (
      <Screen>
        <ParticipantForm config={config} submitting={starting} error={formError} onSubmit={start} />
      </Screen>
    );
  } else if (stage.kind === "device-notice") {
    const strong = config.deviceNotice === "suggest_desktop";
    body = (
      <Screen>
        <ScreenHeader icon="device" title={`Estás usando un ${device?.deviceType === "tablet" ? "tableta" : "celular"}`} />
        <Alert tone={strong ? "warning" : "info"}>
          Para mayor fiabilidad de los resultados, este estudio se recomienda en una <strong>computadora con teclado</strong>.
          {strong ? " Si te es posible, abre esta misma liga en una computadora." : " Puedes continuar en tu dispositivo si lo prefieres."}
        </Alert>
        <Button size="lg" className="w-full" autoFocus onClick={() => setStage({ kind: "intro" })}>
          Continuar en este dispositivo
        </Button>
      </Screen>
    );
  } else if (stage.kind === "intro") {
    const touch = device?.inputMode === "touch";
    body = (
      <Screen>
        <ScreenHeader icon="agenda" title="Instrucciones" />
        <Callout icon="bolt" title="Tu tarea">
          <p>
            Verás palabras, una a la vez, en el centro de la pantalla. Tu tarea es clasificarlas en la categoría correcta{" "}
            <strong>lo más rápido que puedas, sin equivocarte</strong>.
          </p>
        </Callout>
        <Section title={touch ? "Cómo responder en pantalla táctil" : "Cómo responder con el teclado"}>
          {touch ? (
            <p className="text-base leading-relaxed">
              Toca el botón de la <strong>izquierda</strong> o de la <strong>derecha</strong> según la categoría. Sostén el
              dispositivo con comodidad y usa los pulgares.
            </p>
          ) : (
            <p className="text-base leading-relaxed">
              Usa la tecla <kbd className="rounded-md border-2 border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold">E</kbd> para la categoría de la izquierda y la
              tecla <kbd className="rounded-md border-2 border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold">I</kbd> para la de la derecha.
            </p>
          )}
        </Section>
        <Section title="Si te equivocas">
          <p className="text-base leading-relaxed">
            Aparecerá una <span className="font-bold text-red-600">X</span> roja: responde con el otro lado para
            corregir. Busca un lugar tranquilo; el estudio dura unos minutos y no se puede pausar.
          </p>
        </Section>
        <Button size="lg" className="w-full" autoFocus onClick={() => setStage(nDims > 1 ? { kind: "dimension-intro", dim: 0 } : { kind: "block-intro", dim: 0, block: 0 })}>
          Entendido, continuar
        </Button>
      </Screen>
    );
  } else if (stage.kind === "dimension-intro") {
    body = (
      <Screen>
        <ScreenHeader
          title={`Parte ${stage.dim + 1} de ${nDims}`}
          lead={`${stage.dim === 0 ? "¡Comencemos!" : "¡Buen trabajo! Toma un respiro antes de continuar."} Se te presentarán nuevas categorías.`}
        />
        <Button size="lg" className="w-full" autoFocus onClick={() => setStage({ kind: "block-intro", dim: stage.dim, block: 0 })}>
          Continuar
        </Button>
      </Screen>
    );
  } else if (stage.kind === "block-intro" && session) {
    const block = session.plans[stage.dim][stage.block];
    const labels = categoryLabels(config, stage.dim);
    const intro = blockIntro(block, labels, stage.block + 1, blockCount);
    body = (
      <Screen>
        <ScreenHeader
          eyebrow={`${nDims > 1 ? `Parte ${stage.dim + 1} de ${nDims} · ` : ""}${intro.title}`}
          title="Lee antes de empezar"
        />
        <Callout icon="agenda" title="Qué hacer en este bloque">
          <p>{intro.body}</p>
        </Callout>
        <div className="space-y-3">
          <Button size="lg" className="w-full" autoFocus onClick={() => setStage({ kind: "block", dim: stage.dim, block: stage.block })}>
            Comenzar
          </Button>
          {device?.inputMode === "keyboard" ? <p className="text-center text-sm text-muted">o presiona la barra espaciadora</p> : null}
        </div>
      </Screen>
    );
  } else if (stage.kind === "block" && session && device) {
    const block = session.plans[stage.dim][stage.block];
    body = (
      <BlockRunner
        key={`${stage.dim}-${stage.block}`}
        block={block}
        labels={categoryLabels(config, stage.dim)}
        inputMode={device.inputMode}
        onTrialDone={() => setDoneTrials((n) => n + 1)}
        onDone={(records) => onBlockDone(stage.dim, stage.block, records)}
      />
    );
  } else if (stage.kind === "saving") {
    body = saveError ? (
      <StatusScreen brand={false}
        icon="alert"
        title="No pudimos guardar tus respuestas"
        role="alert"
        actions={<Button size="lg" onClick={() => void finishDimension(stage.dim)}>Reintentar</Button>}
      >
        <Alert tone="error">{saveError}</Alert>
        <p className="text-muted">Tus respuestas siguen guardadas en esta ventana: no la cierres.</p>
      </StatusScreen>
    ) : (
      <StatusScreen brand={false} icon="refresh" title="Guardando tus respuestas…" role="status" />
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
      <StatusScreen brand={false} icon="check" title="¡Gracias!" testId="thanks">
        <Prose text={config.texts.thankYou} />
      </StatusScreen>
    );
  } else if (stage.kind === "blocked") {
    body = (
      <StatusScreen brand={false} icon="ban" title="No podemos abrir este estudio">
        <p data-testid="blocked">{stage.message}</p>
      </StatusScreen>
    );
  }

  return (
    <div style={theme} className="min-h-dvh bg-background text-foreground">
      {preview ? (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">
          Vista previa: no se guarda ningún dato.
        </div>
      ) : null}
      {stage.kind === "block" ? <ProgressBar done={doneTrials} total={totalTrials} /> : null}
      {body}
    </div>
  );
}
