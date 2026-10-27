"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
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

function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-6 py-10">{children}</main>;
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

  // Modo neutro: el acento es el color de texto de la marca, no el morado de acción (la pantalla del participante es la más calmada).
  const theme: CSSProperties =
    config.theme.mode === "custom" && config.theme.accent
      ? ({ "--primary": config.theme.accent, "--primary-foreground": readableOn(config.theme.accent) } as CSSProperties)
      : ({ "--primary": "var(--heading)", "--primary-foreground": "var(--background)" } as CSSProperties);

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
          <IconTile name="neuro" />
          <h1 className="text-2xl font-semibold tracking-tight">Estudio sobre {config.product}</h1>
          <p className="text-sm text-muted">Dura unos {minutes} {minutes === 1 ? "minuto" : "minutos"}.</p>
          <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed">{config.texts.consent}</div>
          {startError ? <Alert tone="error">{startError}</Alert> : null}
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            He leído la información y acepto participar de forma voluntaria.
          </label>
          <Button className="w-full" disabled={!consent || starting} onClick={() => void start()}>
            {starting ? "Preparando…" : "Comenzar"}
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "device-notice") {
    const strong = config.deviceNotice === "suggest_desktop";
    body = (
      <Screen>
        <div className="space-y-5">
          <h2 className="text-xl font-semibold tracking-tight">Estás usando un {device?.deviceType === "tablet" ? "tableta" : "celular"}</h2>
          <Alert tone={strong ? "warning" : "info"}>
            Para mayor fiabilidad de los resultados, este estudio se recomienda en una <strong>computadora con teclado</strong>.
            {strong ? " Si te es posible, abre esta misma liga en una computadora." : " Puedes continuar en tu dispositivo si lo prefieres."}
          </Alert>
          <Button className="w-full" autoFocus onClick={() => setStage({ kind: "intro" })}>
            Continuar en este dispositivo
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "intro") {
    body = (
      <Screen>
        <div className="space-y-5">
          <IconTile name="agenda" />
          <h2 className="text-xl font-semibold tracking-tight">Instrucciones</h2>
          <p className="text-sm leading-relaxed">
            Verás palabras en el centro de la pantalla, una a la vez. Antes de cada parte te explicaremos qué hacer.{" "}
            <strong>Responde lo más rápido que puedas, sin equivocarte</strong>: el tiempo para cada palabra es corto a propósito.
          </p>
          <p className="text-sm leading-relaxed">Busca un lugar tranquilo; el estudio no se puede pausar.</p>
          <Button className="w-full" autoFocus onClick={() => setStage({ kind: "block-intro", block: 0 })}>
            Entendido, continuar
          </Button>
        </div>
      </Screen>
    );
  } else if (stage.kind === "block-intro" && plan && device) {
    const block = plan.blocks[stage.block];
    const intro = blockIntro(config, plan, block as never, stage.block + 1, plan.blocks.length, device.inputMode);
    body = (
      <Screen>
        <div className="space-y-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{intro.title}</p>
          <p className="text-base leading-relaxed">{intro.body}</p>
          <Button className="w-full" autoFocus onClick={() => setStage({ kind: "block", block: stage.block })}>
            Comenzar
          </Button>
          {device.inputMode === "keyboard" ? <p className="text-center text-xs text-muted">o presiona la barra espaciadora</p> : null}
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
    body = (
      <Screen>
        <div className="space-y-4 text-center">
          {saveError ? (
            <>
              <Alert tone="error">{saveError}</Alert>
              <p className="text-sm text-muted">Tus respuestas siguen en esta ventana: no la cierres.</p>
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
    <div style={theme} className="min-h-dvh bg-background text-foreground" data-device={device?.deviceType}>
      {preview ? (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">Vista previa: no se guarda ningún dato.</div>
      ) : null}
      {stage.kind === "block" ? <ProgressBar done={doneTrials} total={total} /> : null}
      {body}
    </div>
  );
}
