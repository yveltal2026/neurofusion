"use client";

import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { MAX_BATTERY_STEPS, orderWarnings, suggestOrder, type StepInfo, type StepTool } from "../engine/config";

export interface StudyOption {
  id: string;
  name: string;
  tool: StepTool;
  status: "draft" | "published" | "closed";
  /** Duración estimada en minutos. */
  minutes: number;
}

export interface DraftStep {
  studyId: string;
  enabled: boolean;
}

const TOOL_ICON = { iat: "neuro", survey: "survey" } as const;
const TOOL_LABEL = { iat: "IAT", survey: "Encuesta" } as const;
const STATUS_TONE = { published: "success", draft: "neutral", closed: "warning" } as const;
const STATUS_LABEL = { published: "Publicado", draft: "Borrador", closed: "Cerrado" } as const;

/** Información de los pasos para los avisos (misma regla pura que usa el servidor). */
export function infosOf(steps: readonly DraftStep[], studies: readonly StudyOption[]): StepInfo[] {
  const byId = new Map(studies.map((s) => [s.id, s]));
  return steps.flatMap((s) => {
    const st = byId.get(s.studyId);
    return st ? [{ studyId: st.id, name: st.name, tool: st.tool, enabled: s.enabled, studyStatus: st.status, minutes: st.minutes }] : [];
  });
}

const TONE = { error: "error", warning: "warning", info: "info" } as const;

/**
 * Editor controlado de los pasos de una batería: agregar, ordenar, omitir y quitar, con el orden sugerido
 * y los avisos metodológicos. Los avisos no bloquean (salvo los de nivel error, que impiden abrir la batería).
 */
export function StepsEditor({
  studies,
  steps,
  onChange,
  disabled = false,
}: {
  studies: readonly StudyOption[];
  steps: DraftStep[];
  onChange: (steps: DraftStep[]) => void;
  disabled?: boolean;
}) {
  const byId = new Map(studies.map((s) => [s.id, s]));
  const used = new Set(steps.map((s) => s.studyId));
  const available = studies.filter((s) => !used.has(s.id));
  const infos = infosOf(steps, studies);
  const warnings = orderWarnings(infos);
  const minutes = infos.filter((i) => i.enabled).reduce((sum, i) => sum + (i.minutes ?? 0), 0);

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange(next);
  }

  function suggest() {
    const order = suggestOrder(infos).map((i) => i.studyId);
    onChange(order.map((id) => steps.find((s) => s.studyId === id)!));
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          Aún no hay pasos. Agrega los estudios del proyecto que el participante hará, en orden, con una sola liga.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Pasos de la batería">
          {steps.map((step, i) => {
            const study = byId.get(step.studyId);
            if (!study) return null;
            return (
              <li
                key={step.studyId}
                className={`flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 ${step.enabled ? "" : "opacity-60"}`}
              >
                <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted" aria-hidden>
                  {i + 1}
                </span>
                <IconTile name={TOOL_ICON[study.tool]} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{study.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {TOOL_LABEL[study.tool]} · ~{study.minutes} min
                    <StatusBadge tone={STATUS_TONE[study.status]}>{STATUS_LABEL[study.status]}</StatusBadge>
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    disabled={disabled}
                    onChange={(e) => onChange(steps.map((s) => (s.studyId === step.studyId ? { ...s, enabled: e.target.checked } : s)))}
                  />
                  Incluir
                </label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" className="h-9 px-2" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${study.name}`}>
                    <Icon name="arrow" className="size-5 -rotate-90" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-2"
                    disabled={disabled || i === steps.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Bajar ${study.name}`}
                  >
                    <Icon name="arrow" className="size-5 rotate-90" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-2"
                    disabled={disabled}
                    onClick={() => onChange(steps.filter((s) => s.studyId !== step.studyId))}
                    aria-label={`Quitar ${study.name}`}
                  >
                    <Icon name="trash" className="size-5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Agregar estudio</span>
          <select
            className="block h-11 min-w-56 rounded-md border border-border bg-surface px-3 text-sm"
            value=""
            disabled={disabled || available.length === 0 || steps.length >= MAX_BATTERY_STEPS}
            onChange={(e) => e.target.value && onChange([...steps, { studyId: e.target.value, enabled: true }])}
          >
            <option value="">{available.length === 0 ? "No hay más estudios en el proyecto" : "Elige un estudio…"}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {TOOL_LABEL[s.tool]} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" disabled={disabled || steps.length < 2} onClick={suggest}>
          <Icon name="refresh" className="size-5" />
          Usar el orden sugerido
        </Button>
      </div>

      {steps.length > 0 ? (
        <p className="text-sm text-muted">
          Duración estimada: <strong className="text-foreground">~{minutes} min</strong> con los pasos incluidos.
        </p>
      ) : null}

      {warnings.length ? (
        <ul className="space-y-2">
          {warnings.map((w) => (
            <li key={w.code + w.text}>
              <Alert tone={TONE[w.level]}>{w.text}</Alert>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
