"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  addStep,
  FAMILY_LABEL,
  familyOf,
  isSuggestedOrder,
  moveStep,
  orderWarnings,
  removeStep,
  suggestOrder,
  TOOL_LABEL,
  toggleStep,
  type BatteryStep,
  type BatteryToolType,
} from "../engine";

export { TOOL_LABEL };

/** Estudio del proyecto que se puede agregar como paso. */
export interface AvailableStudy {
  studyId: string;
  toolType: BatteryToolType;
  name: string;
  /** Sólo en los estudios de imagen: cuántas imágenes verá el participante. */
  pieces?: number;
}

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 px-3"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {label.startsWith("Subir") ? "↑" : label.startsWith("Bajar") ? "↓" : "✕"}
    </Button>
  );
}

/**
 * Editor de los pasos de una batería. La plataforma SUGIERE el orden (exposición → implícita →
 * explícita) pero el investigador manda: puede intercambiar pasos, omitir los que no necesite y volver
 * al orden sugerido. Los avisos metodológicos no impiden guardar.
 */
export function StepsEditor({
  steps,
  onChange,
  available,
  readOnly = false,
}: {
  steps: BatteryStep[];
  onChange: (steps: BatteryStep[]) => void;
  /** Estudios del proyecto que aún no son pasos. */
  available: AvailableStudy[];
  readOnly?: boolean;
}) {
  const [choice, setChoice] = useState("");
  // Mientras el investigador no reordene a mano, cada paso nuevo se acomoda según el orden sugerido.
  const [touchedOrder, setTouchedOrder] = useState(false);
  const warnings = orderWarnings(steps);
  const free = available.filter(
    (a) => !steps.some((s) => s.studyId === a.studyId),
  );
  const selectable = free.filter((a) => a.pieces !== 0);
  const selected =
    selectable.find((a) => a.studyId === choice) ?? selectable[0];

  function add() {
    if (!selected) return;
    const next = addStep(steps, {
      studyId: selected.studyId,
      toolType: selected.toolType,
      name: selected.name,
    });
    onChange(touchedOrder ? next : suggestOrder(next));
    setChoice("");
  }

  const reorder = (next: BatteryStep[]) => {
    setTouchedOrder(true);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <p className="text-sm text-muted">
          Aún no hay pasos. Agrega al menos uno.
        </p>
      ) : null}

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.studyId}>
            <Card
              className={`flex flex-wrap items-center gap-3 py-3 ${step.enabled ? "" : "opacity-60"}`}
            >
              <span className="w-6 text-sm tabular-nums text-muted">
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={step.name}>
                  {step.name}
                </p>
                <p className="text-xs text-muted">
                  {TOOL_LABEL[step.toolType]} · {FAMILY_LABEL[familyOf(step)]}
                  {step.enabled ? "" : " · omitido"}
                </p>
              </div>
              {readOnly ? (
                <span className="text-xs text-muted">
                  {step.enabled ? "Activo" : "Omitido"}
                </span>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      onChange={() => onChange(toggleStep(steps, step.studyId))}
                      aria-label={`Activo: ${step.name}`}
                    />
                    Activo
                  </label>
                  <div className="flex gap-1">
                    <IconButton
                      label={`Subir paso ${index + 1}`}
                      onClick={() => reorder(moveStep(steps, index, -1))}
                      disabled={index === 0}
                    />
                    <IconButton
                      label={`Bajar paso ${index + 1}`}
                      onClick={() => reorder(moveStep(steps, index, 1))}
                      disabled={index === steps.length - 1}
                    />
                    <IconButton
                      label={`Quitar paso ${index + 1}`}
                      onClick={() => onChange(removeStep(steps, step.studyId))}
                    />
                  </div>
                </>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {warnings.map((w) => (
        <Alert key={w.code + w.studyIds.join()} tone="warning">
          {w.message}
        </Alert>
      ))}

      {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1.5 text-sm sm:max-w-sm">
            <span className="block font-medium text-heading">Agregar paso</span>
            <select
              className="h-10 w-full rounded-md border border-control bg-background px-3 text-sm"
              value={selected?.studyId ?? ""}
              onChange={(e) => setChoice(e.target.value)}
              disabled={selectable.length === 0}
            >
              {selectable.length === 0 ? (
                <option value="">
                  {free.length === 0
                    ? "No hay más estudios en este proyecto"
                    : "Los estudios de imagen necesitan imágenes primero"}
                </option>
              ) : null}
              {free.map((a) => (
                <option
                  key={a.studyId}
                  value={a.studyId}
                  disabled={a.pieces === 0}
                >
                  {TOOL_LABEL[a.toolType]} · {a.name}
                  {a.pieces === undefined
                    ? ""
                    : a.pieces === 0
                      ? " (sin imágenes: súbelas primero)"
                      : ` (${a.pieces} ${a.pieces === 1 ? "imagen" : "imágenes"})`}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={add}
            disabled={!selected}
          >
            Agregar
          </Button>
          {steps.length > 1 && !isSuggestedOrder(steps) ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTouchedOrder(false);
                onChange(suggestOrder(steps));
              }}
            >
              Restaurar orden sugerido
            </Button>
          ) : null}
        </div>
      ) : null}

      {!readOnly && steps.length > 1 ? (
        <p className="text-xs text-muted">
          Orden sugerido: exposición (imágenes y eye tracking) → medidas implícitas (IAT y
          variantes) → explícitas (encuestas). Puedes cambiarlo u omitir pasos
          según el objetivo del estudio.
        </p>
      ) : null}
    </div>
  );
}
