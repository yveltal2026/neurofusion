"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GUIDED_TOUR_STEPS } from "@/lib/onboarding/missions";

export function GuidedTourModal({
  open,
  tourAlreadyCompleted,
  pending,
  onClose,
  onFinishTour,
}: {
  open: boolean;
  tourAlreadyCompleted: boolean;
  pending: boolean;
  onClose: () => void;
  onFinishTour: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const step = GUIDED_TOUR_STEPS[stepIdx] ?? GUIDED_TOUR_STEPS[0];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === GUIDED_TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-tour-title"
    >
      <div className="w-full max-w-lg rounded-panel border border-border bg-surface p-6 shadow-2xl motion-reduce:transition-none">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {step.badge}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-full px-3 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-heading"
          >
            Cerrar
          </button>
        </div>

        <h2 id="guided-tour-title" className="mt-4 text-xl font-bold text-heading">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-body">{step.body}</p>

        <p className="mt-4 rounded-xl border border-border bg-surface-muted/60 px-3.5 py-2.5 text-xs text-muted">
          {step.tip}
        </p>

        {step.ctaHref && step.ctaLabel ? (
          <div className="mt-3">
            <Link
              href={step.ctaHref}
              onClick={onClose}
              className="inline-flex text-xs font-semibold text-accent-text hover:underline"
            >
              {step.ctaLabel} →
            </Link>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-1.5" aria-label="Progreso del tour">
            {GUIDED_TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Ir al paso ${idx + 1}`}
                onClick={() => setStepIdx(idx)}
                className={`h-2.5 rounded-full transition-all motion-reduce:transition-none ${
                  idx === stepIdx ? "w-6 bg-heading" : "w-2.5 bg-border hover:bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              >
                Anterior
              </Button>
            ) : null}

            {!isLast ? (
              <Button
                type="button"
                onClick={() =>
                  setStepIdx((i) => Math.min(GUIDED_TOUR_STEPS.length - 1, i + 1))
                }
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending}
                onClick={onFinishTour}
              >
                {pending
                  ? "Guardando…"
                  : tourAlreadyCompleted
                    ? "Finalizar recorrido"
                    : "Finalizar y sumar +5 créditos"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
