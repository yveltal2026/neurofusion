"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InputMode } from "@/tools/iat/runner/device";
import type { VariantConfig } from "../config";
import type { GnatBlock, PrimingBlock, ResponseKey, ScBlock, Side } from "../plan";
import type { SideLabels } from "./labels";

/**
 * Un bloque de ensayos de cualquiera de las tres variantes. Los tiempos se miden con
 * performance.now() desde que el estímulo se pinta (requestAnimationFrame), igual que el IAT clásico.
 * Línea de tiempo de un ensayo:
 *  - SC-IAT:  pausa → palabra (hasta tecla o fin de ventana) → señal de error/lento si falla.
 *  - GNAT:    pausa → palabra (fija hasta el plazo; «go» con espacio o toque) → señal de error si falla.
 *  - Priming: pausa → prime (primeMs) → blanco (blankMs) → palabra (hasta tecla o tope) → señal sólo en práctica.
 */

const FIRST_ITI_MS = 500;
const ITI_MS = 350;
const MARK_MS = 350;

/** Teclas físicas (por posición, independiente de la distribución del teclado). */
const KEY_SIDE: Record<string, Side> = { KeyE: "left", KeyI: "right" };

export interface TrialResponse {
  seq: number;
  key: ResponseKey;
  rtMs: number | null;
}

type Phase = "iti" | "prime" | "blank" | "stim" | "mark";

/** Marca de tiempo del evento, comparable con performance.now(); si no lo es, la hora actual. */
function eventTime(e: { timeStamp: number }): number {
  const now = performance.now();
  return e.timeStamp > 0 && e.timeStamp <= now + 5 ? e.timeStamp : now;
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border-2 border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold">{children}</kbd>;
}

function Labels({ items }: { items: string[] }) {
  return (
    <div className="space-y-1 text-center">
      {items.map((text, i) => (
        <div key={text}>
          {i > 0 ? <div className="text-xs text-muted">o</div> : null}
          <div className="text-lg font-semibold sm:text-2xl">{text}</div>
        </div>
      ))}
    </div>
  );
}

type Block = ScBlock | GnatBlock | PrimingBlock;

export function VariantBlockRunner({
  config,
  block,
  sides,
  goTargets,
  inputMode,
  onTrialDone,
  onDone,
}: {
  config: VariantConfig;
  block: Block;
  /** SC-IAT y priming: rótulos de cada lado. */
  sides: SideLabels | null;
  /** GNAT: categorías que exigen responder. */
  goTargets: string[] | null;
  inputMode: InputMode;
  onTrialDone: () => void;
  onDone: (responses: TrialResponse[]) => void;
}) {
  const variant = config.variant;
  const params = config.params;
  const limitMs = "windowMs" in params ? params.windowMs : "deadlineMs" in params ? params.deadlineMs : params.maxResponseMs;
  const primeMs = "primeMs" in params ? params.primeMs : 0;
  const blankMs = "blankMs" in params ? params.blankMs : 0;
  // Señal de error: siempre en SC-IAT y GNAT; en priming sólo durante la práctica.
  const feedback = variant === "priming" ? block.practice : true;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("iti");
  const [mark, setMark] = useState<"error" | "slow" | null>(null);
  const t0Ref = useRef<number | null>(null);
  const respRef = useRef<{ key: ResponseKey; rt: number } | null>(null);
  const finishedRef = useRef(-1);
  const recordsRef = useRef<TrialResponse[]>([]);
  const trials = block.trials as (ScBlock["trials"][number] | GnatBlock["trials"][number] | PrimingBlock["trials"][number])[];
  const trial = trials[idx];

  const advance = useCallback(() => {
    if (idx + 1 >= trials.length) {
      onDone(recordsRef.current);
      return;
    }
    respRef.current = null;
    setMark(null);
    setIdx(idx + 1);
    setPhase("iti");
  }, [idx, trials.length, onDone]);

  /** Cierra el ensayo actual (por respuesta o por fin de plazo). Idempotente por ensayo. */
  const finish = useCallback(() => {
    if (finishedRef.current === idx) return;
    finishedRef.current = idx;
    const resp = respRef.current;
    recordsRef.current.push({ seq: trial.seq, key: resp?.key ?? null, rtMs: resp ? Math.round(resp.rt * 10) / 10 : null });
    t0Ref.current = null;
    onTrialDone();

    let correct: boolean;
    if ("signal" in trial) correct = trial.signal ? resp?.key === "go" : resp === null;
    else correct = resp?.key === trial.correctSide;
    if (feedback && !correct) {
      setMark(resp ? "error" : "slow");
      setPhase("mark");
    } else {
      advance();
    }
  }, [idx, trial, feedback, advance, onTrialDone]);

  const respond = useCallback(
    (key: Exclude<ResponseKey, null>, now: number) => {
      if (phase !== "stim" || t0Ref.current === null || respRef.current) return;
      respRef.current = { key, rt: Math.max(0, now - t0Ref.current) };
      // SC-IAT y priming terminan con la respuesta; el GNAT espera al plazo (duración fija del ensayo).
      if (variant !== "gnat") finish();
    },
    [phase, variant, finish],
  );

  // Pausas entre fases.
  useEffect(() => {
    const next: Partial<Record<Phase, { ms: number; to: Phase }>> = {
      iti: { ms: idx === 0 ? FIRST_ITI_MS : ITI_MS, to: variant === "priming" ? "prime" : "stim" },
      prime: { ms: primeMs, to: blankMs > 0 ? "blank" : "stim" },
      blank: { ms: blankMs, to: "stim" },
    };
    const step = next[phase];
    if (step) {
      const id = window.setTimeout(() => setPhase(step.to), step.ms);
      return () => window.clearTimeout(id);
    }
    if (phase === "mark") {
      const id = window.setTimeout(advance, MARK_MS);
      return () => window.clearTimeout(id);
    }
  }, [phase, idx, variant, primeMs, blankMs, advance]);

  // t0 = instante en que la palabra se pinta; el plazo corre desde ahí. Lo anterior se ignora.
  useEffect(() => {
    if (phase !== "stim") return;
    let timer: number | undefined;
    const raf = requestAnimationFrame(() => {
      t0Ref.current = performance.now();
      timer = window.setTimeout(finish, limitMs);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [phase, limitMs, finish]);

  useEffect(() => {
    if (inputMode !== "keyboard") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (variant === "gnat") {
        if (e.code !== "Space") return;
        e.preventDefault();
        respond("go", eventTime(e));
        return;
      }
      const side = KEY_SIDE[e.code];
      if (!side) return;
      e.preventDefault();
      respond(side, eventTime(e));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputMode, variant, respond]);

  const touch = inputMode === "touch";
  const showWord = phase === "stim";
  const showPrime = phase === "prime" && "primeText" in trial;
  const isConceptWord = "category" in trial && (trial.category === "target" || trial.category === "concept" || trial.category === "noise_concept");

  return (
    <div className="flex min-h-dvh flex-col select-none [touch-action:manipulation]" data-testid="block-runner" data-variant={variant}>
      {variant === "gnat" ? (
        <div className="space-y-1 p-6 text-center" data-testid="go-targets">
          <p className="text-xs uppercase tracking-wide text-muted">Responde sólo si ves</p>
          <p className="text-lg font-semibold sm:text-2xl">{(goTargets ?? []).join("  ·  ")}</p>
          {!touch ? (
            <p className="pt-1">
              <Kbd>Espacio</Kbd>
            </p>
          ) : null}
        </div>
      ) : sides && !touch ? (
        <div className="grid grid-cols-2 gap-4 p-6">
          <div className="space-y-2" data-testid="side-left">
            <Labels items={sides.left} />
            <div className="text-center">
              <Kbd>E</Kbd>
            </div>
          </div>
          <div className="space-y-2" data-testid="side-right">
            <Labels items={sides.right} />
            <div className="text-center">
              <Kbd>I</Kbd>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-32 items-center justify-center text-center">
          {showPrime ? (
            <span data-testid="prime" className="font-bold uppercase tracking-wide text-primary" style={{ fontSize: "clamp(36px, 8vw, 72px)" }}>
              {(trial as { primeText: string }).primeText}
            </span>
          ) : null}
          {showWord ? (
            <span
              data-testid="stimulus"
              className={`font-semibold leading-tight ${isConceptWord ? "text-primary" : ""}`}
              style={{ fontSize: "clamp(48px, 10vw, 96px)" }}
            >
              {trial.text}
            </span>
          ) : null}
        </div>
        <div role="alert" aria-live="assertive" className="h-20 text-center font-bold leading-none" data-testid="mark">
          {mark === "error" ? <span className="text-7xl text-red-600">X</span> : null}
          {mark === "slow" ? <span className="text-2xl text-red-600">Más rápido</span> : null}
        </div>
      </div>

      {touch ? (
        variant === "gnat" ? (
          <div className="p-3" style={{ height: "38dvh" }}>
            <button
              type="button"
              data-testid="touch-go"
              onPointerDown={(e) => {
                if (e.isPrimary === false) return;
                e.preventDefault();
                respond("go", eventTime(e));
              }}
              className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-border bg-foreground/5 text-xl font-semibold active:bg-primary/20"
            >
              Tocar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-3" style={{ height: "38dvh" }}>
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                data-testid={`touch-${side}`}
                onPointerDown={(e) => {
                  if (e.isPrimary === false) return;
                  e.preventDefault();
                  respond(side, eventTime(e));
                }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-border bg-foreground/5 p-3 active:bg-primary/20"
              >
                <Labels items={sides?.[side] ?? []} />
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
