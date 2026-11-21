"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  completeTourMissionAction,
  dismissOnboardingChecklistAction,
  reopenOnboardingChecklistAction,
} from "@/lib/onboarding/actions";
import {
  ONBOARDING_MISSIONS,
  computeOnboardingSummary,
  type OnboardingMissionId,
} from "@/lib/onboarding/missions";
import { GuidedTourModal } from "./guided-tour-modal";

export function OnboardingChecklist({
  completedMissions,
  tourCompletedAt,
  checklistDismissedAt,
  firstProjectId,
}: {
  completedMissions: OnboardingMissionId[];
  tourCompletedAt: string | null;
  checklistDismissedAt: string | null;
  firstProjectId?: string | null;
}) {
  const [tourOpen, setTourOpen] = useState(false);
  const [localCompleted, setLocalCompleted] =
    useState<OnboardingMissionId[]>(completedMissions);
  const [dismissed, setDismissed] = useState(Boolean(checklistDismissedAt));
  const [pending, startTransition] = useTransition();

  const summary = computeOnboardingSummary(localCompleted);
  const completedSet = new Set(localCompleted);

  function handleFinishTour() {
    startTransition(async () => {
      await completeTourMissionAction();
      setLocalCompleted((prev) =>
        prev.includes("guided_tour_or_sample")
          ? prev
          : [...prev, "guided_tour_or_sample"],
      );
      setTourOpen(false);
    });
  }

  function handleDismiss() {
    setDismissed(true);
    startTransition(async () => {
      await dismissOnboardingChecklistAction();
    });
  }

  function handleReopen() {
    setDismissed(false);
    startTransition(async () => {
      await reopenOnboardingChecklistAction();
    });
  }

  if (dismissed) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface/80 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-muted">
            <span className="font-semibold text-heading">
              Bienvenida ({summary.completedCount}/{summary.totalCount})
            </span>
            <span>
              · +{summary.earnedCredits}/{summary.maxCredits} créditos ganados
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTourOpen(true)}
            >
              Ver tour guiado
            </Button>
            {!summary.isComplete ? (
              <Button type="button" variant="ghost" onClick={handleReopen}>
                Mostrar checklist
              </Button>
            ) : null}
          </div>
        </div>
        <GuidedTourModal
          open={tourOpen}
          tourAlreadyCompleted={Boolean(tourCompletedAt) || completedSet.has("guided_tour_or_sample")}
          pending={pending}
          onClose={() => setTourOpen(false)}
          onFinishTour={handleFinishTour}
        />
      </>
    );
  }

  return (
    <>
      <section
        aria-labelledby="onboarding-heading"
        className="glass-panel rounded-panel border border-amber-500/30 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                {summary.isComplete
                  ? "¡Onboarding completo! +30 créditos desbloqueados"
                  : `Duplica tus créditos · +${summary.remainingCredits} disponibles`}
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted">
                {summary.completedCount}/{summary.totalCount} misiones
              </span>
            </div>
            <h2 id="onboarding-heading" className="text-lg font-bold text-heading">
              Primeros pasos en Aesteros
            </h2>
            <p className="text-sm text-muted">
              Completa estas acciones para aprender a usar la plataforma y sumar hasta +30 créditos extra.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTourOpen(true)}
            >
              Ver tour guiado
            </Button>
            <Button type="button" variant="ghost" onClick={handleDismiss}>
              Ocultar
            </Button>
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          aria-label="Progreso de onboarding"
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-300 motion-reduce:transition-none"
            style={{ width: `${summary.percent}%` }}
          />
        </div>

        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {ONBOARDING_MISSIONS.map((mission) => {
            const done = completedSet.has(mission.id);
            const targetHref =
              mission.id === "first_study" && firstProjectId
                ? `/projects/${firstProjectId}/studies/new`
                : mission.href ?? "#nuevo-proyecto";

            return (
              <li
                key={mission.id}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 ${
                  done
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-border bg-surface/60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : "border border-border bg-surface text-muted"
                    }`}
                  >
                    {done ? "✓" : "•"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-heading">
                      {mission.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {mission.description}
                    </p>
                    {!done ? (
                      mission.actionType === "open_tour" ? (
                        <button
                          type="button"
                          onClick={() => setTourOpen(true)}
                          className="mt-1.5 text-xs font-semibold text-accent-text hover:underline"
                        >
                          {mission.actionLabel} →
                        </button>
                      ) : (
                        <Link
                          href={targetHref}
                          className="mt-1.5 inline-block text-xs font-semibold text-accent-text hover:underline"
                        >
                          {mission.actionLabel} →
                        </Link>
                      )
                    ) : null}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    done
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  +{mission.rewardCredits}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <GuidedTourModal
        open={tourOpen}
        tourAlreadyCompleted={Boolean(tourCompletedAt) || completedSet.has("guided_tour_or_sample")}
        pending={pending}
        onClose={() => setTourOpen(false)}
        onFinishTour={handleFinishTour}
      />
    </>
  );
}
