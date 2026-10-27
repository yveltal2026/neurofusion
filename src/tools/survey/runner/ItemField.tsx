"use client";

import { Input, Textarea } from "@/components/ui/field";
import type { SurveyItem } from "../engine";

const OPTION_CLASS =
  "flex cursor-pointer items-center min-h-12 gap-3 rounded-md border border-border px-4 py-3 text-sm transition-colors duration-150 motion-reduce:transition-none hover:border-heading/50 has-[:checked]:border-heading has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40";
const POINT_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-md border border-border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40";

/**
 * Campo de una encuesta según el tipo de elemento. El valor es el tipado que espera el
 * esquema del servidor (texto, número, opción o lista de opciones); `undefined` = sin responder.
 */
export function ItemField({
  item,
  value,
  error,
  onChange,
}: {
  item: SurveyItem;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const label = `${item.label}${item.required ? "" : " (opcional)"}`;
  const errorId = `${item.id}-error`;
  const err = error ? (
    <p id={errorId} className="text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (item.type === "multiselect") {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset
        className="space-y-2"
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="text-base font-medium">{label}</legend>
        <p className="text-xs text-muted">Puedes elegir varias opciones.</p>
        {item.options.map((o) => (
          <label key={o} className={OPTION_CLASS}>
            <input
              type="checkbox"
              checked={picked.includes(o)}
              onChange={() =>
                onChange(
                  picked.includes(o)
                    ? picked.filter((p) => p !== o)
                    : [...picked, o],
                )
              }
            />
            {o}
          </label>
        ))}
        {err}
      </fieldset>
    );
  }

  if (item.type === "select") {
    return (
      <fieldset
        className="space-y-2"
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="text-base font-medium">{label}</legend>
        {item.options.map((o) => (
          <label key={o} className={OPTION_CLASS}>
            <input
              type="radio"
              name={item.id}
              checked={value === o}
              onChange={() => onChange(o)}
            />
            {o}
          </label>
        ))}
        {err}
      </fieldset>
    );
  }

  if (item.type === "scale") {
    // Escala con todas las opciones rotuladas: lista vertical (se lee bien en el celular).
    if (item.labels) {
      return (
        <fieldset
          className="space-y-2"
          aria-describedby={error ? errorId : undefined}
        >
          <legend className="text-base font-medium">{label}</legend>
          {item.labels.map((text, i) => {
            const n = item.min + i;
            return (
              <label key={n} className={OPTION_CLASS}>
                <input
                  type="radio"
                  name={item.id}
                  checked={value === n}
                  onChange={() => onChange(n)}
                />
                {text}
              </label>
            );
          })}
          {err}
        </fieldset>
      );
    }
    const points = Array.from(
      { length: item.max - item.min + 1 },
      (_, i) => item.min + i,
    );
    return (
      <fieldset
        className="space-y-2"
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="text-base font-medium">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {points.map((n) => (
            <label key={n} className={POINT_CLASS}>
              <input
                type="radio"
                name={item.id}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={`${n}${n === item.min && item.minLabel ? ` (${item.minLabel})` : n === item.max && item.maxLabel ? ` (${item.maxLabel})` : ""}`}
              />
              {n}
            </label>
          ))}
        </div>
        {item.minLabel || item.maxLabel ? (
          <div className="flex justify-between gap-4 text-xs text-muted">
            <span>
              {item.min} = {item.minLabel ?? ""}
            </span>
            <span className="text-right">
              {item.max} = {item.maxLabel ?? ""}
            </span>
          </div>
        ) : null}
        {err}
      </fieldset>
    );
  }

  if (item.type === "number") {
    return (
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-base font-medium text-heading">{label}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={item.min}
            max={item.max}
            value={typeof value === "number" ? String(value) : ""}
            onChange={(e) =>
              onChange(
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {err}
      </div>
    );
  }

  // text
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-base font-medium text-heading">{label}</span>
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : e.target.value)
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {err}
    </div>
  );
}
