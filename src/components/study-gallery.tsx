"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icon";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";

export type StudyGalleryItem = Pick<
  StudyRow,
  "id" | "name" | "tool_type" | "config" | "status" | "created_at"
> & {
  max_responses?: number | null;
  metricCount?: number;
  lastResponseAt?: string | null;
};

type StatusFilter = "all" | StudyRow["status"];
type StudySort = "recent" | "activity" | "name";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "published", label: "Publicados" },
  { value: "draft", label: "Borradores" },
  { value: "closed", label: "Cerrados" },
];

const STATUS_LABEL: Record<StudyRow["status"], string> = {
  draft: "Borrador",
  published: "Publicado",
  closed: "Cerrado",
};

const STATUS_TONE: Record<StudyRow["status"], "neutral" | "success" | "warning"> = {
  draft: "neutral",
  published: "success",
  closed: "warning",
};

function studyMetricSummary(study: StudyGalleryItem): { label: string; progress?: number } {
  const count = study.metricCount ?? 0;
  if (study.tool_type === "visual") {
    return {
      label: count === 0 ? "Sin piezas aún" : `${count} ${count === 1 ? "pieza" : "piezas"}`,
    };
  }
  if (study.tool_type === "seo") {
    return {
      label: count === 0 ? "Sin auditorías aún" : `${count} ${count === 1 ? "auditoría" : "auditorías"}`,
    };
  }
  if (study.max_responses && study.max_responses > 0) {
    const pct = Math.min(100, Math.round((count / study.max_responses) * 100));
    return {
      label: `${count} de ${study.max_responses} participantes`,
      progress: pct,
    };
  }
  return {
    label: count === 0 ? "Sin participantes aún" : `${count} ${count === 1 ? "participante" : "participantes"}`,
  };
}

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "all" || value === "published" || value === "draft" || value === "closed";
}

function isStudySort(value: string | null): value is StudySort {
  return value === "recent" || value === "activity" || value === "name";
}

export function StudyGallery({ studies }: { studies: StudyGalleryItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<StudySort>("recent");
  const hydrated = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") ?? "";
    const initialStatus = params.get("status");
    const initialSort = params.get("sort");
    if (initialQuery) setQuery(initialQuery);
    if (isStatusFilter(initialStatus)) setStatus(initialStatus);
    if (isStudySort(initialSort)) setSort(initialSort);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams(window.location.search);
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    if (status !== "all") params.set("status", status);
    else params.delete("status");
    if (sort !== "recent") params.set("sort", sort);
    else params.delete("sort");
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [query, status, sort]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const needle = query.trim().toLocaleLowerCase("es-MX");
  const hasActiveFilter = Boolean(needle) || status !== "all";
  const shown = studies
    .filter((study) => {
      if (status !== "all" && study.status !== status) return false;
      const tool = getStudyTool(study);
      if (needle) {
        const haystack = `${study.name} ${tool?.shortName ?? ""} ${tool?.name ?? ""}`.toLocaleLowerCase("es-MX");
        if (!haystack.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "activity") {
        const aTime = a.lastResponseAt ?? a.created_at;
        const bTime = b.lastResponseAt ?? b.created_at;
        return bTime.localeCompare(aTime);
      }
      if (sort === "name") return a.name.localeCompare(b.name, "es-MX");
      return b.created_at.localeCompare(a.created_at);
    });

  function clearFilters() {
    setQuery("");
    setStatus("all");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="relative w-full max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) setQuery("");
            }}
            placeholder="Buscar estudio..."
            aria-label="Buscar estudio por nombre o herramienta"
            aria-keyshortcuts="Control+K Meta+K Escape"
            className="min-h-11 w-full rounded-full border border-border/80 bg-surface/90 py-1.5 pr-20 pl-10 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/25 sm:text-sm"
          />
          {query ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-heading motion-reduce:transition-none"
            >
              <Icon name="close" className="size-4" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border/80 bg-surface-muted/80 px-1.5 py-0.5 font-sans text-xs font-medium text-muted sm:inline-flex"
            >
              Ctrl/⌘ K
            </kbd>
          )}
        </div>

        <div
          role="group"
          aria-label="Filtrar estudios por estado"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/70 bg-surface-muted/85 p-1"
        >
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(option.value)}
                className={`min-h-10 rounded-full px-3.5 text-xs font-semibold transition-[background-color,color,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  active
                    ? "bg-surface text-heading shadow-xs"
                    : "text-muted hover:text-heading"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Ordenar estudios"
            value={sort}
            onChange={(event) => setSort(event.target.value as StudySort)}
            className="min-h-11 rounded-full border border-border/80 bg-surface/90 px-3.5 text-xs font-semibold text-heading outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/25 motion-reduce:transition-none"
          >
            <option value="recent">Más recientes</option>
            <option value="activity">Última respuesta</option>
            <option value="name">Nombre A–Z</option>
          </select>

          <p aria-live="polite" className="text-xs font-semibold tabular-nums text-muted">
            {hasActiveFilter
              ? `${shown.length} de ${studies.length} estudios`
              : `${studies.length} ${studies.length === 1 ? "estudio" : "estudios"}`}
          </p>
        </div>
      </div>

      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Estudios del proyecto">
          {shown.map((study) => {
            const tool = getStudyTool(study);
            const metric = studyMetricSummary(study);
            return (
              <li key={study.id} className="relative">
                <article className="group relative flex h-full min-w-0 flex-col justify-between gap-4 rounded-[18px] border border-border/80 bg-surface p-5 shadow-[0_14px_34px_-22px_rgba(122,62,18,0.22)] transition-[border-color,box-shadow,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] focus-within:border-accent-ink focus-within:ring-2 focus-within:ring-accent-ink/25 hover:border-accent-ink/60 hover:shadow-[0_18px_40px_-22px_rgba(122,62,18,0.3)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100">
                  <div>
                    <div className="mb-3.5 flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-xl border border-border/70 bg-surface-muted/60 text-accent-ink">
                        <Icon name={tool?.icon ?? "layers"} className="size-5" />
                      </span>
                      <StatusBadge tone={STATUS_TONE[study.status]}>
                        {STATUS_LABEL[study.status]}
                      </StatusBadge>
                    </div>
                    <h3 className="break-words text-lg font-bold tracking-tight text-heading">
                      <Link
                        href={`/studies/${study.id}`}
                        className="after:absolute after:inset-0 focus:outline-none group-hover:underline"
                      >
                        {study.name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {tool?.shortName ?? study.tool_type}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    {typeof metric.progress === "number" ? (
                      <div
                        role="progressbar"
                        aria-valuenow={metric.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={metric.label}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                          style={{ width: `${metric.progress}%` }}
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted">
                      <span className="font-semibold text-foreground/80">{metric.label}</span>
                      <span className="inline-flex items-center gap-2">
                        {study.lastResponseAt ? (
                          <span>
                            Última respuesta{" "}
                            <time dateTime={study.lastResponseAt}>
                              {new Date(study.lastResponseAt).toLocaleDateString("es-MX", {
                                timeZone: "America/Mexico_City",
                              })}
                            </time>
                          </span>
                        ) : (
                          <time dateTime={study.created_at}>
                            {new Date(study.created_at).toLocaleDateString("es-MX", {
                              timeZone: "America/Mexico_City",
                            })}
                          </time>
                        )}
                        <Icon
                          name="arrow"
                          className="size-4 shrink-0 text-muted transition-transform duration-[var(--duracion-micro)] group-hover:translate-x-0.5 group-hover:text-heading motion-reduce:transition-none"
                        />
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border/80 bg-surface p-5 text-sm text-muted" role="status">
          <p>
            {needle
              ? `Ningún estudio coincide con «${query.trim()}».`
              : "Ningún estudio coincide con el filtro seleccionado."}
          </p>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
