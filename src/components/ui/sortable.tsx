"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Orden de una tabla en el cliente: pulsar el encabezado de la columna activa invierte el sentido y pulsar otra la
 * activa. `accessors` devuelve el valor comparable de cada fila (número o texto).
 */
export function useSort<T, K extends string>(rows: T[], accessors: Record<K, (row: T) => number | string>, initial?: { key: K; dir: SortDir }) {
  const [state, setState] = useState<{ key: K; dir: SortDir } | null>(initial ?? null);
  const sorted = useMemo(() => {
    if (!state) return rows;
    const get = accessors[state.key];
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
      return state.dir === "asc" ? c : -c;
    });
    // `accessors` es un literal estable por llamada: sólo importan las filas y el estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state]);
  const toggle = (key: K) => setState((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sorted, state, toggle };
}

/** Encabezado de columna ordenable: botón con flecha y `aria-sort`. */
export function SortTh<K extends string>({
  label,
  k,
  sort,
  className = "",
}: {
  label: string;
  k: K;
  sort: { state: { key: K; dir: SortDir } | null; toggle: (key: K) => void };
  className?: string;
}) {
  const active = sort.state?.key === k;
  return (
    <th scope="col" className={`px-3 py-2.5 ${className}`} aria-sort={active ? (sort.state!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort.toggle(k)} className="inline-flex items-center gap-1 font-semibold hover:text-neuro-ink">
        {label}
        <span aria-hidden="true" className={active ? "text-neuro-ink" : "text-muted/60"}>
          {active ? (sort.state!.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
