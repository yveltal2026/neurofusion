"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Callout, ConsentCheck, FactList, ParticipantScreen, Prose, ReadingPanel, ScreenHeader, Section, StatusScreen } from "@/components/participant";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { EmbeddedStep } from "@/lib/embedded-step";
import { withRetry } from "@/tools/iat/runner/api";
import { detectDevice, type DeviceInfo } from "@/tools/iat/runner/device";
import { readableOn } from "@/tools/iat/runner/labels";
import type { VariantConfig } from "../config";
import { buildPlan, estimateVariantMinutes, planHash, totalTrials, type GnatBlock, type VariantPlan } from "../plan";
import { variantApi } from "./api";
import { blockIntro, gnatTargets, sideLabelsFor } from "./labels";
import { VariantBlockRunner, type TrialResponse } from "./VariantBlockRunner";

type Stage =
  | { kind: "welcome" }
  | { kind: "device-notice" }
  | { kind: "intro" }
  | { kind: "block-intro"; block: number }
  | { kind: "block"; block: number }
  | { kind: "saving" }
  | { kind: "thanks" }
  | { kind: "blocked"; message: string };

/** Códigos de error que cierran el estudio para el participante (no tiene caso reintentar). */
const BLOCKING = ["already_participated", "closed", "full", "not_available", "invalid_link"];

// Paleta neutra: el kit del participante sin la marca, para no sesgar la percepción.
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

const newPreviewId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000000");

export function VariantRunner({
  token,
  config,
  preview,
  embedded,
}: {
  token: string;
  config: VariantConfig;
  preview: boolean;
  /** Si la variante corre como paso de una batería (sin consentimiento ni bienvenida propios). */
  embedded?: EmbeddedStep;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "welcome" });
  const [consent, setConsent] = useState(false);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [plan, setPlan] = useState<VariantPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [doneTrials, setDoneTrials] = useState(0);
  const responsesRef = useRef<TrialResponse[]>([]);
  const autoStartedRef = useRef(false);
  const completedRef = useRef(false);

  const total = useMemo(() => (plan ? totalTrials(plan) : 0), [plan]);
  const minutes = useMemo(() => estimateVariantMinutes(config), [config]);

  // Pre-chequeo: avisa de inmediato si ya participó o el estudio cerró.
  useEffect(() => {
    if (preview || embedded) return;
    let cancelled = false;
    variantApi.check(token).then((res) => {
      if (!cancelled && !res.ok && BLOCKING.includes(res.code)) setStage({ kind: "blocked", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [token, preview, embedded]);

  // Bloquea el scroll mientras se responde.
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

  // Espacio inicia el bloque desde su pantalla de instrucciones (teclado).
  const startKeyTarget = stage.kind === "block-intro" && device?.inputMode === "keyboard" ? stage.block : null;
  useEffect(() => {
    if (startKeyTarget === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setStage({ kind: "block", block: startKeyTarget });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startKeyTarget]);

  const start = useCallback(async () => {
    const info = detectDevice();
    setDevice(info);
    setStarting(true);
    setStartError(null);
    let id = newPreviewId();
    if (!preview) {
      const res = await withRetry(() => variantApi.start(token, info, embedded?.batterySessionId), { retries: 2 });
      if (!res.ok) {
        setStarting(false);
        if (BLOCKING.includes(res.code)) setStage({ kind: "blocked", message: res.message });
        else setStartError(res.message);
        return;
      }
      id = res.sessionId;
    }
    setSessionId(id);
    setPlan(buildPlan(config, id));
    setStarting(false);
    setStage(info.inputMode === "touch" ? { kind: "device-notice" } : { kind: "intro" });
  }, [preview, token, config, embedded]);

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
    if (!plan || !sessionId) return;
    setStage({ kind: "saving" });
    setSaveError(null);
    if (!preview) {
      const res = await withRetry(() => variantApi.submit(token, sessionId, { planHash: planHash(plan), responses: responsesRef.current }));
      if (!res.ok) {
        if (BLOCKING.includes(res.code) || res.code === "not_found") {
          setStage({ kind: "blocked", message: res.message });
          return;
        }
        setSaveError(res.message);
        return; // permanece en "saving" con botón Reintentar
      }
    }
    setStage({ kind: "thanks" });
  }, [plan, sessionId, preview, token]);

  const onBlockDone = useCallback(
    (blockIdx: number, responses: TrialResponse[]) => {
      responsesRef.current.push(...responses);
      if (plan && blockIdx + 1 < plan.blocks.length) setStage({ kind: "block-intro", block: blockIdx + 1 });
      else void submit();
    },
    [plan, submit],
  );

  // Modo neutro: el acento es el color de texto de la marca, no el morado de acción (la pantalla del participante es la
  // más calmada). Los tokens de Neuro también se neutralizan para que el kit no tiña el estudio.
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
        <ScreenHeader icon="neuro" title={`Estudio sobre ${config.product}`} />
        <Section title="Qué vas a hacer">
          <FactList
            items={[
              { icon: "clock", text: `Dura unos ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` },
              { icon: "bolt", text: "Verás palabras en pantalla y responderás lo más rápido que puedas." },
              { icon: "device", text: "Funciona mejor en una computadora con teclado." },
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
          <Button size="lg" className="w-full" disabled={!consent || starting} onClick={() => void start()}>
            {starting ? "Preparando…" : "Comenzar"}
          </Button>
        </div>
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
    body = (
      <Screen>
        <ScreenHeader icon="agenda" title="Instrucciones" />
        <Callout icon="bolt" title="Tu tarea">
          <p>
            Verás palabras en el centro de la pantalla, una a la vez. Antes de cada parte te explicaremos qué hacer.{" "}
            <strong>Responde lo más rápido que puedas, sin equivocarte</strong>: el tiempo para cada palabra es corto a propósito.
          </p>
        </Callout>
        <Section title="Antes de empezar">
          <p className="text-base leading-relaxed">Busca un lugar tranquilo; el estudio no se puede pausar.</p>
        </Section>
        <Button size="lg" className="w-full" autoFocus onClick={() => setStage({ kind: "block-intro", block: 0 })}>
          Entendido, continuar
        </Button>
      </Screen>
    );
  } else if (stage.kind === "block-intro" && plan && device) {
    const block = plan.blocks[stage.block];
    const intro = blockIntro(config, plan, block as never, stage.block + 1, plan.blocks.length, device.inputMode);
    body = (
      <Screen>
        <ScreenHeader eyebrow={intro.title} title="Lee antes de empezar" />
        <Callout icon="agenda" title="Qué hacer en este bloque">
          <p>{intro.body}</p>
        </Callout>
        <div className="space-y-3">
          <Button size="lg" className="w-full" autoFocus onClick={() => setStage({ kind: "block", block: stage.block })}>
            Comenzar
          </Button>
          {device.inputMode === "keyboard" ? <p className="text-center text-sm text-muted">o presiona la barra espaciadora</p> : null}
        </div>
      </Screen>
    );
  } else if (stage.kind === "block" && plan && device) {
    const block = plan.blocks[stage.block];
    body = (
      <VariantBlockRunner
        key={block.id}
        config={config}
        block={block as never}
        sides={sideLabelsFor(config, plan, block as never)}
        goTargets={plan.variant === "gnat" ? gnatTargets(config, block as GnatBlock) : null}
        inputMode={device.inputMode}
        onTrialDone={() => setDoneTrials((n) => n + 1)}
        onDone={(responses) => onBlockDone(stage.block, responses)}
      />
    );
  } else if (stage.kind === "saving") {
    body = saveError ? (
      <StatusScreen
        brand={false}
        icon="alert"
        title="No pudimos guardar tus respuestas"
        role="alert"
        actions={<Button size="lg" onClick={() => void submit()}>Reintentar</Button>}
      >
        <Alert tone="error">{saveError}</Alert>
        <p className="text-muted">Tus respuestas siguen en esta ventana: no la cierres.</p>
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
    <div style={theme} className="min-h-dvh bg-background text-foreground" data-device={device?.deviceType}>
      {preview ? (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">Vista previa: no se guarda ningún dato.</div>
      ) : null}
      {stage.kind === "block" ? <ProgressBar done={doneTrials} total={total} /> : null}
      {body}
    </div>
  );
}
