"use client";

import { Input, Textarea } from "@/components/ui/field";
import { MAX_TEXT_ANSWER, type SurveyItem } from "../engine";

const OPTION_CLASS =
  "flex cursor-pointer items-center min-h-12 gap-3 rounded-md border border-border px-4 py-3 text-sm transition-colors duration-150 motion-reduce:transition-none hover:border-heading/50 has-[:checked]:border-heading has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40";
// Escala numérica: una sola fila con columnas iguales (nunca se parte en dos renglones), con relleno teal al elegir.
const POINT_CLASS =
  "flex h-11 min-w-0 cursor-pointer items-center justify-center rounded-md border border-border text-sm transition-colors duration-150 hover:border-heading/50 has-[:checked]:border-heading has-[:checked]:bg-heading has-[:checked]:text-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-heading motion-reduce:transition-none";

function numberHint(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined)
    return `Escribe sólo el número, entre ${min} y ${max}.`;
  if (min !== undefined) return `Escribe sólo el número (${min} o más).`;
  if (max !== undefined) return `Escribe sólo el número (${max} o menos).`;
  return "Escribe sólo el número.";
}

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
        <p className="text-sm text-muted">Puedes elegir varias opciones.</p>
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
        <p className="text-sm text-muted">Elige una opción.</p>
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
        {/* Los ítems de un instrumento ya traen su propia indicación al inicio de la parte. */}
        {!item.instrument && !(item.minLabel || item.maxLabel) ? (
          <p className="text-sm text-muted">
            Elige un número del {item.min} al {item.max}.
          </p>
        ) : null}
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
          }}
        >
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
          <div className="flex justify-between gap-4 text-sm text-muted">
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
          {!item.unit ? (
            <span className="block text-sm text-muted">
              {numberHint(item.min, item.max)}
            </span>
          ) : null}
          <span className="flex items-center gap-3">
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
            {item.unit ? (
              <span className="shrink-0 text-sm font-semibold text-heading">
                {item.unit}
              </span>
            ) : null}
          </span>
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
          placeholder="Escribe tu respuesta aquí"
          maxLength={MAX_TEXT_ANSWER}
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

/**
 * Escalas de polos opuestos que comparten enunciado («Mi opinión sobre X es:» … mala / buena).
 * El enunciado se lee una vez y cada fila muestra sus dos palabras en los extremos, para que se vea
 * qué cambia entre una fila y otra.
 */
export function BipolarGroup({
  items,
  values,
  errors,
  onChange,
}: {
  items: Extract<SurveyItem, { type: "scale" }>[];
  values: Record<string, unknown>;
  errors: Record<string, string | undefined>;
  onChange: (id: string, value: unknown) => void;
}) {
  const first = items[0]!;
  const label = `${first.label}${first.required ? "" : " (opcional)"}`;
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-medium">{label}</legend>
      {items.map((item) => {
        const points = Array.from(
          { length: item.max - item.min + 1 },
          (_, i) => item.min + i,
        );
        const errorId = `${item.id}-error`;
        return (
          <div
            key={item.id}
            role="radiogroup"
            aria-label={`${item.minLabel} a ${item.maxLabel}`}
            aria-describedby={errors[item.id] ? errorId : undefined}
            className="space-y-2 rounded-md border border-border bg-surface p-3"
          >
            <div className="flex justify-between gap-4 text-sm font-semibold text-heading">
              <span>{item.minLabel}</span>
              <span className="text-right">{item.maxLabel}</span>
            </div>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
              }}
            >
              {points.map((n) => (
                <label
                  key={n}
                  className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-border text-sm transition-colors duration-150 hover:border-heading/50 has-[:checked]:border-heading has-[:checked]:bg-heading has-[:checked]:text-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-heading motion-reduce:transition-none"
                >
                  <input
                    type="radio"
                    name={item.id}
                    value={n}
                    checked={values[item.id] === n}
                    onChange={() => onChange(item.id, n)}
                    className="sr-only"
                    aria-label={`${n}${n === item.min ? ` (${item.minLabel})` : n === item.max ? ` (${item.maxLabel})` : ""}`}
                  />
                  {n}
                </label>
              ))}
            </div>
            {errors[item.id] ? (
              <p id={errorId} className="text-sm text-danger">
                {errors[item.id]}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
