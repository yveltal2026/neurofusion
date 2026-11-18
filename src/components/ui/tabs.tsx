"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Cifra opcional junto a la etiqueta (p. ej. número de hallazgos). */
  count?: number;
  content: ReactNode;
}

/**
 * Pestañas accesibles (patrón WAI-ARIA: flechas, Inicio y Fin; tabindex itinerante).
 * Los paneles inactivos se ocultan en pantalla pero se imprimen todos.
 * Soporta variante "underline" (línea inferior tradicional) y "segmented" (control por segmentos fijo).
 */
export function Tabs({
  label,
  items,
  defaultTab,
  className = "",
  variant = "underline",
  gridColumns,
}: {
  label: string;
  items: TabItem[];
  defaultTab?: string;
  className?: string;
  variant?: "underline" | "segmented";
  /** Definición opcional de columnas CSS Grid para la variante segmentada (p. ej. "1.4fr 1.1fr 0.8fr 0.8fr"). */
  gridColumns?: string;
}) {
  const base = useId();
  const [active, setActive] = useState(defaultTab && items.some((t) => t.id === defaultTab) ? defaultTab : items[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.some((t) => t.id === active) ? active : items[0]?.id;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = items.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(items[next].id);
    refs.current[next]?.focus();
  };

  const isSegmented = variant === "segmented";

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={
          isSegmented
            ? "grid gap-1 rounded-xl border border-border bg-surface-muted/60 p-1 print:hidden"
            : "flex gap-1 overflow-x-auto border-b border-border print:hidden"
        }
        style={
          isSegmented
            ? { gridTemplateColumns: gridColumns ?? `repeat(${items.length}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {items.map((t, i) => {
          const selected = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={
                isSegmented
                  ? `relative flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-heading sm:text-sm ${
                      selected
                        ? "border border-border/80 bg-surface text-heading shadow-xs"
                        : "border border-transparent text-muted hover:bg-foreground/5 hover:text-heading"
                    }`
                  : `relative -mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-heading ${
                      selected ? "border-primary text-heading" : "border-transparent text-muted hover:text-heading"
                    }`
              }
            >
              <span className="truncate">{t.label}</span>
              {t.count ? (
                <span
                  className={
                    isSegmented
                      ? `rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums sm:text-xs ${
                          selected ? "bg-heading text-background" : "bg-foreground/10 text-foreground"
                        }`
                      : `rounded-full px-1.5 text-xs tabular-nums ${
                          selected ? "bg-heading text-background" : "bg-foreground/10 text-foreground"
                        }`
                  }
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          tabIndex={0}
          className={`pt-6 focus-visible:outline-none ${t.id === current ? "block" : "hidden print:block"}`}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
