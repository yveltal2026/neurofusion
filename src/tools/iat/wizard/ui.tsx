"use client";

import { useState, type ReactNode } from "react";
import { parseWordList } from "../config";

/** Recuadro con la recomendación metodológica del paso (la voz de la skill). */
export function Recommendation({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="font-medium text-primary">Recomendación: </span>
      {children}
    </div>
  );
}

export function StepShell({
  title,
  question,
  children,
}: {
  title: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
        <h2 className="text-xl font-semibold tracking-tight">{question}</h2>
      </header>
      {children}
    </section>
  );
}

export function RadioCard({
  checked,
  onChange,
  title,
  badge,
  children,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  badge?: string;
  children?: ReactNode;
  name: string;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-lg border p-4 transition ${
        checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[var(--primary)]" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{title}</span>
            {badge ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{badge}</span> : null}
          </div>
          {children ? <div className="text-sm text-muted">{children}</div> : null}
        </div>
      </div>
    </label>
  );
}

/**
 * Lista de palabras editable como texto libre (una por línea o separadas por
 * comas). Conserva el texto crudo mientras se escribe para no mover el cursor y
 * emite la lista ya limpia. `resetKey` fuerza a recargar el texto desde fuera
 * (p. ej. al cargar una sugerencia).
 */
export function WordsInput({
  value,
  onChange,
  min,
  max,
  resetKey,
  ariaLabel,
  rows = 6,
}: {
  value: string[];
  onChange: (words: string[]) => void;
  min: number;
  max: number;
  resetKey?: string | number;
  ariaLabel: string;
  rows?: number;
}) {
  const [raw, setRaw] = useState(value.join("\n"));
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    // Recarga controlada desde el padre (ajuste de estado durante el render, patrón soportado por React).
    setSeenKey(resetKey);
    setRaw(value.join("\n"));
  }
  const count = value.length;
  const status = count < min ? "text-amber-600" : count > max ? "text-red-600" : "text-muted";
  return (
    <div className="space-y-1">
      <textarea
        aria-label={ariaLabel}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(parseWordList(e.target.value));
        }}
        rows={rows}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        placeholder="Una palabra por línea"
      />
      <p className={`text-xs ${status}`}>
        {count} palabra{count === 1 ? "" : "s"} · {min > 0 ? `mínimo ${min}, ` : ""}máximo {max}
      </p>
    </div>
  );
}
