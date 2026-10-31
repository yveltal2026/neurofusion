"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import {
  LIKERT_MAX_POINTS,
  LIKERT_MIN_POINTS,
  MAX_OPTIONS,
  MAX_TEXT_ANSWER,
} from "../engine";
import { QUESTION_TYPE_ICONS } from "./catalog";
import { DraftImagePreview, QuestionImageEditor } from "./QuestionImageEditor";
import {
  joinOptions,
  QUESTION_TYPE_LABELS,
  splitOptions,
  type DraftQuestion,
  type QuestionType,
} from "./model";

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];
const POINTS = Array.from(
  { length: LIKERT_MAX_POINTS - LIKERT_MIN_POINTS + 1 },
  (_, i) => LIKERT_MIN_POINTS + i,
);

const PLAIN_INPUT =
  "min-w-0 flex-1 border-b-2 border-transparent bg-transparent py-2 text-sm outline-none transition hover:border-border focus:border-heading focus-visible:outline-none";
const BOXED_CONTROL =
  "rounded-md border border-control bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40";

// ------------------------------------------------------------------ vista previa

/** Escala numerada tal como la verá el participante (decorativa: el texto de la pregunta ya la describe). */
function ScalePreview({
  from,
  to,
  minLabel,
  maxLabel,
}: {
  from: number;
  to: number;
  minLabel?: string;
  maxLabel?: string;
}) {
  const points = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div aria-hidden="true" className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {points.map((n) => (
          <span
            key={n}
            className="flex size-9 items-center justify-center rounded-md border border-border text-xs text-muted"
          >
            {n}
          </span>
        ))}
      </div>
      {minLabel || maxLabel ? (
        <div className="flex justify-between gap-4 text-xs text-muted">
          <span>
            {from} = {minLabel ?? ""}
          </span>
          <span className="text-right">
            {to} = {maxLabel ?? ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function OptionShape({ multi }: { multi: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`size-4.5 shrink-0 border-2 border-heading/50 ${multi ? "rounded-md" : "rounded-full"}`}
    />
  );
}

/** Lo que verá el participante, sin controles: así una tarjeta inactiva se lee como la encuesta final. */
function QuestionPreview({ q }: { q: DraftQuestion }) {
  const prompt = q.prompt.trim();
  const options = splitOptions(q.optionsText)
    .map((o) => o.trim())
    .filter(Boolean);
  const shown = options.slice(0, 5);
  return (
    <div className="space-y-3">
      <p className="font-medium text-foreground">
        {prompt || <span className="text-muted">Pregunta sin enunciado</span>}
        {q.required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (obligatoria)</span>
          </>
        ) : null}
      </p>
      {q.image ? <DraftImagePreview image={q.image} /> : null}
      {q.type === "select" || q.type === "multiselect" ? (
        <ul aria-hidden="true" className="space-y-1.5">
          {shown.map((o, i) => (
            <li key={`${o}-${i}`} className="flex items-center gap-3 text-sm">
              <OptionShape multi={q.type === "multiselect"} />
              {o}
            </li>
          ))}
          {options.length > shown.length ? (
            <li className="pl-7.5 text-xs text-muted">
              y {options.length - shown.length} más
            </li>
          ) : null}
        </ul>
      ) : null}
      {q.type === "likert" ? (
        <ScalePreview
          from={1}
          to={q.points}
          minLabel={q.minLabel.trim() || undefined}
          maxLabel={q.maxLabel.trim() || undefined}
        />
      ) : null}
      {q.type === "nps" ? (
        <ScalePreview
          from={0}
          to={10}
          minLabel="Nada probable"
          maxLabel="Muy probable"
        />
      ) : null}
      {q.type === "number" ? (
        <p
          aria-hidden="true"
          className="w-48 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted"
        >
          Número
          {q.min.trim() || q.max.trim()
            ? ` (${q.min.trim() || "…"} a ${q.max.trim() || "…"})`
            : ""}
        </p>
      ) : null}
      {q.type === "text" ? (
        <p
          aria-hidden="true"
          className="border-b border-dashed border-border py-1.5 text-sm text-muted"
        >
          Respuesta de texto
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ editores por tipo

/** Opciones como filas editables: Enter agrega una debajo, Retroceso en una fila vacía la quita. */
function OptionsEditor({
  multi,
  optionsText,
  onChange,
}: {
  multi: boolean;
  optionsText: string;
  onChange: (optionsText: string) => void;
}) {
  const options = splitOptions(optionsText);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // Fila que debe recibir el foco tras el siguiente render (la nueva o la anterior a una quitada).
  const focusAt = useRef<number | null>(null);
  const full = options.length >= MAX_OPTIONS;

  useEffect(() => {
    if (focusAt.current === null) return;
    inputs.current[focusAt.current]?.focus();
    focusAt.current = null;
  });

  const set = (next: string[], focus?: number) => {
    onChange(joinOptions(next));
    if (focus !== undefined) focusAt.current = focus;
  };
  const insertAfter = (i: number) => {
    if (full) return;
    set([...options.slice(0, i + 1), "", ...options.slice(i + 1)], i + 1);
  };
  const remove = (i: number) =>
    set(
      options.filter((_, j) => j !== i),
      Math.max(0, i - 1),
    );

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-3">
            <OptionShape multi={multi} />
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              aria-label={`Opción ${i + 1}`}
              className={PLAIN_INPUT}
              value={o}
              maxLength={60}
              onChange={(e) =>
                set(options.map((x, j) => (j === i ? e.target.value : x)))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertAfter(i);
                } else if (
                  e.key === "Backspace" &&
                  o === "" &&
                  options.length > 1
                ) {
                  e.preventDefault();
                  remove(i);
                }
              }}
            />
            <IconButton
              icon="close"
              label={`Quitar opción ${i + 1}`}
              onClick={() => remove(i)}
              disabled={options.length <= 1}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <OptionShape multi={multi} />
        <button
          type="button"
          onClick={() => set([...options, ""], options.length)}
          disabled={full}
          className="rounded-full px-1 py-2 text-sm font-medium text-heading underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
        >
          {full ? `Máximo ${MAX_OPTIONS} opciones` : "Agregar opción"}
        </button>
      </div>
    </div>
  );
}

function LikertEditor({
  q,
  onChange,
}: {
  q: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-sm font-medium text-heading">
        Puntos de la escala
        <select
          className={`h-10 ${BOXED_CONTROL}`}
          value={q.points}
          onChange={(e) => onChange({ points: Number(e.target.value) })}
        >
          {POINTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Etiqueta del extremo bajo">
          <input
            className={`h-11 w-full ${BOXED_CONTROL}`}
            value={q.minLabel}
            onChange={(e) => onChange({ minLabel: e.target.value })}
            placeholder="Ej.: Nada de acuerdo"
            maxLength={40}
          />
        </Field>
        <Field label="Etiqueta del extremo alto">
          <input
            className={`h-11 w-full ${BOXED_CONTROL}`}
            value={q.maxLabel}
            onChange={(e) => onChange({ maxLabel: e.target.value })}
            placeholder="Ej.: Totalmente de acuerdo"
            maxLength={40}
          />
        </Field>
      </div>
      {!q.minLabel.trim() && !q.maxLabel.trim() ? (
        <Alert tone="warning">
          Sin etiquetas, el participante verá sólo números y no sabrá cuál es el
          extremo bueno. Escribe qué significa cada extremo.
        </Alert>
      ) : null}
      <ScalePreview
        from={1}
        to={q.points}
        minLabel={q.minLabel.trim() || undefined}
        maxLabel={q.maxLabel.trim() || undefined}
      />
    </div>
  );
}

function NumberEditor({
  q,
  onChange,
}: {
  q: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Mínimo (opcional)">
        <input
          type="number"
          className={`h-11 w-full ${BOXED_CONTROL}`}
          value={q.min}
          onChange={(e) => onChange({ min: e.target.value })}
        />
      </Field>
      <Field label="Máximo (opcional)">
        <input
          type="number"
          className={`h-11 w-full ${BOXED_CONTROL}`}
          value={q.max}
          onChange={(e) => onChange({ max: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ tarjeta

export function QuestionCard({
  q,
  index,
  count,
  active,
  problems,
  onActivate,
  onChange,
  onChangeType,
  onMove,
  onDuplicate,
  onRemove,
}: {
  q: DraftQuestion;
  index: number;
  count: number;
  active: boolean;
  /** Mensajes de validación de esta pregunta (vacío si no hay). */
  problems: string[];
  onActivate: () => void;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onChangeType: (type: QuestionType) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const wrapper = `scroll-mt-28 rounded-lg bg-surface transition-colors duration-150 motion-reduce:transition-none ${
    active
      ? "border-2 border-heading shadow-sm"
      : problems.length
        ? "border-2 border-danger/60"
        : "border border-border hover:border-heading/50"
  }`;

  const issues = problems.length ? (
    <ul className="space-y-1" role="alert">
      {problems.map((p) => (
        <li key={p} className="flex items-center gap-2 text-sm text-foreground">
          <Icon name="alert" className="size-5 text-danger" />
          {p}
        </li>
      ))}
    </ul>
  ) : null;

  if (!active) {
    return (
      <div id={`sb-${q.id}`} className={wrapper}>
        <button
          type="button"
          onClick={onActivate}
          className="block w-full rounded-lg p-5 text-left"
        >
          <span className="sr-only">Editar pregunta {index + 1}. </span>
          <span className="mb-1.5 block text-xs text-muted" aria-hidden="true">
            Pregunta {index + 1}
          </span>
          <QuestionPreview q={q} />
          {issues ? <span className="mt-3 block">{issues}</span> : null}
        </button>
      </div>
    );
  }

  return (
    <div id={`sb-${q.id}`} className={wrapper}>
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs text-muted">
              Pregunta {index + 1}
            </span>
            <input
              autoFocus
              aria-label="Enunciado"
              placeholder="Escribe la pregunta"
              className="w-full rounded-md border-b-2 border-heading/40 bg-foreground/5 px-4 py-3 text-base font-medium outline-none transition focus:border-heading focus-visible:ring-2 focus-visible:ring-heading/40"
              value={q.prompt}
              maxLength={300}
              onChange={(e) => onChange({ prompt: e.target.value })}
            />
          </div>
          <div className="relative sm:mt-6 sm:w-56">
            <Icon
              name={QUESTION_TYPE_ICONS[q.type]}
              className="pointer-events-none absolute left-3 top-1/2 size-6 -translate-y-1/2"
            />
            <select
              aria-label="Tipo de pregunta"
              className={`h-12 w-full appearance-none pl-12 pr-10 ${BOXED_CONTROL}`}
              value={q.type}
              onChange={(e) => onChangeType(e.target.value as QuestionType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2"
            />
          </div>
        </div>

        <QuestionImageEditor image={q.image} onChange={(image) => onChange({ image })} />

        {q.type === "select" || q.type === "multiselect" ? (
          <OptionsEditor
            multi={q.type === "multiselect"}
            optionsText={q.optionsText}
            onChange={(optionsText) => onChange({ optionsText })}
          />
        ) : null}
        {q.type === "likert" ? (
          <LikertEditor q={q} onChange={onChange} />
        ) : null}
        {q.type === "number" ? (
          <NumberEditor q={q} onChange={onChange} />
        ) : null}
        {q.type === "nps" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Escala fija de 0 a 10, con «Nada probable» y «Muy probable» en los
              extremos.
            </p>
            <ScalePreview
              from={0}
              to={10}
              minLabel="Nada probable"
              maxLabel="Muy probable"
            />
          </div>
        ) : null}
        {q.type === "text" ? (
          <p className="border-b border-dashed border-border py-1.5 text-sm text-muted">
            El participante escribe su respuesta (hasta {MAX_TEXT_ANSWER}{" "}
            caracteres).
          </p>
        ) : null}

        {issues}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
        <Switch
          label="Obligatoria"
          checked={q.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
        <div className="flex">
          <IconButton
            icon="chevron"
            rotate={180}
            label={`Subir pregunta ${index + 1}`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
          />
          <IconButton
            icon="chevron"
            label={`Bajar pregunta ${index + 1}`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          />
          <IconButton
            icon="copy"
            label={`Duplicar pregunta ${index + 1}`}
            onClick={onDuplicate}
          />
          <IconButton
            icon="trash"
            label={`Quitar pregunta ${index + 1}`}
            onClick={onRemove}
          />
        </div>
      </div>
    </div>
  );
}
