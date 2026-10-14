"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannedBlock, Side } from "../engine/types";
import type { SubmittedTrial } from "../session";
import type { InputMode } from "./device";
import { isConcept, sideLabels, type CategoryLabels } from "./labels";
import { handlePress, startTrial, type TrialState } from "./trial-logic";

const FIRST_ITI_MS = 500;
const ITI_MS = 250;

/** Teclas físicas (por posición, independiente de la distribución del teclado). */
const KEY_SIDE: Record<string, Side> = { KeyE: "left", KeyI: "right" };

/** Marca de tiempo del evento, comparable con performance.now(); si no lo es, la hora actual. */
function eventTime(e: { timeStamp: number }): number {
  const now = performance.now();
  return e.timeStamp > 0 && e.timeStamp <= now + 5 ? e.timeStamp : now;
}

function Labels({ categories, labels }: { categories: PlannedBlock["leftCategories"]; labels: CategoryLabels }) {
  const items = sideLabels(categories, labels);
  return (
    <div className="space-y-1 text-center">
      {items.map((l, i) => (
        <div key={l.text}>
          {i > 0 ? <div className="text-xs text-muted">o</div> : null}
          <div className={l.concept ? "text-lg font-bold uppercase tracking-wide text-primary sm:text-2xl" : "text-lg font-medium sm:text-2xl"}>
            {l.text}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BlockRunner({
  block,
  labels,
  inputMode,
  onTrialDone,
  onDone,
}: {
  block: PlannedBlock;
  labels: CategoryLabels;
  inputMode: InputMode;
  /** Se llama tras cada ensayo completado (para la barra de progreso). */
  onTrialDone: () => void;
  onDone: (records: SubmittedTrial[]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"iti" | "stim">("iti");
  const [showError, setShowError] = useState(false);
  const trialRef = useRef<TrialState | null>(null);
  const recordsRef = useRef<SubmittedTrial[]>([]);
  const trial = block.trials[idx];

  // Intervalo entre ensayos (pantalla en blanco) → aparece el estímulo.
  useEffect(() => {
    if (phase !== "iti") return;
    const id = window.setTimeout(() => setPhase("stim"), idx === 0 ? FIRST_ITI_MS : ITI_MS);
    return () => window.clearTimeout(id);
  }, [phase, idx]);

  // t0 = instante en que el estímulo se pinta. Las respuestas previas se ignoran.
  useEffect(() => {
    if (phase !== "stim") return;
    const raf = requestAnimationFrame(() => {
      trialRef.current = startTrial(performance.now());
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, idx]);

  const press = useCallback(
    (side: Side, now: number) => {
      const state = trialRef.current;
      if (!state || phase !== "stim") return;
      const { state: next, outcome } = handlePress(state, side, trial.correctSide, now);
      trialRef.current = next;
      setShowError(next.showError);
      if (!outcome) return;

      trialRef.current = null; // ignora pulsaciones hasta que aparezca el siguiente estímulo
      recordsRef.current.push({
        block: block.block,
        index: trial.index,
        rtMs: Math.round(outcome.rtMs * 10) / 10,
        pressed: outcome.pressed,
      });
      onTrialDone();
      if (idx + 1 >= block.trials.length) {
        onDone(recordsRef.current);
      } else {
        setIdx(idx + 1);
        setPhase("iti");
      }
    },
    [phase, trial, block, idx, onTrialDone, onDone],
  );

  useEffect(() => {
    if (inputMode !== "keyboard") return;
    const onKey = (e: KeyboardEvent) => {
      const side = KEY_SIDE[e.code];
      if (!side || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      press(side, eventTime(e));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputMode, press]);

  const touch = inputMode === "touch";
  const conceptStimulus = isConcept(trial.category);

  return (
    <div className="flex min-h-dvh flex-col select-none [touch-action:manipulation]" data-testid="block-runner">
      {!touch ? (
        <div className="grid grid-cols-2 gap-4 p-6">
          <div className="space-y-2" data-testid="side-left">
            <Labels categories={block.leftCategories} labels={labels} />
            <div className="text-center"><kbd className="rounded-md border-2 border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold">E</kbd></div>
          </div>
          <div className="space-y-2" data-testid="side-right">
            <Labels categories={block.rightCategories} labels={labels} />
            <div className="text-center"><kbd className="rounded-md border-2 border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold">I</kbd></div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-32 items-center justify-center text-center">
          {phase === "stim" ? (
            <span
              data-testid="stimulus"
              data-category={trial.category}
              className={`font-semibold leading-tight ${conceptStimulus ? "text-primary" : ""}`}
              style={{ fontSize: "clamp(48px, 10vw, 96px)" }}
            >
              {trial.text}
            </span>
          ) : null}
        </div>
        <div role="alert" aria-live="assertive" className="h-20 text-7xl font-bold leading-none text-red-600" data-testid="error-mark">
          {showError ? "X" : ""}
        </div>
      </div>

      {touch ? (
        <div className="grid grid-cols-2 gap-3 p-3" style={{ height: "38dvh" }}>
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              data-testid={`touch-${side}`}
              onPointerDown={(e) => {
                if (e.isPrimary === false) return;
                e.preventDefault();
                press(side, eventTime(e));
              }}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-border bg-foreground/5 p-3 active:bg-primary/20"
            >
              <Labels categories={side === "left" ? block.leftCategories : block.rightCategories} labels={labels} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
