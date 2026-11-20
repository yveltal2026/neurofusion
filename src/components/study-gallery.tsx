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
};

type StatusFilter = "all" | StudyRow["status"];

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

export function StudyGallery({ studies }: { studies: StudyGalleryItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

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
  const shown = studies.filter((study) => {
    if (status !== "all" && study.status !== status) return false;
    const tool = getStudyTool(study);
    if (needle) {
      const haystack = `${study.name} ${tool?.shortName ?? ""} ${tool?.name ?? ""}`.toLocaleLowerCase("es-MX");
      if (!haystack.includes(needle)) return false;
    }
    return true;
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
            className="min-h-10 w-full rounded-full border border-border/80 bg-surface/90 py-1.5 pr-20 pl-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/25"
          />
          {!query ? (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border/80 bg-surface-muted/80 px-1.5 py-0.5 font-sans text-xs font-medium text-muted sm:inline-flex"
            >
              Ctrl/⌘ K
            </kbd>
          ) : null}
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

        <p className="text-xs font-semibold tabular-nums text-muted">
          {hasActiveFilter
            ? `${shown.length} de ${studies.length} estudios`
            : `${studies.length} ${studies.length === 1 ? "estudio" : "estudios"}`}
        </p>
      </div>

      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Estudios del proyecto">
          {shown.map((study) => {
            const tool = getStudyTool(study);
            const metric = studyMetricSummary(study);
            return (
              <li key={study.id}>
                <Link
                  href={`/studies/${study.id}`}
                  className="group flex h-full min-w-0 flex-col justify-between gap-4 rounded-[18px] border border-border/80 bg-surface p-5 shadow-[0_14px_34px_-22px_rgba(122,62,18,0.22)] transition-[border-color,box-shadow,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] hover:border-accent-ink/60 hover:shadow-[0_18px_40px_-22px_rgba(122,62,18,0.3)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <div>
                    <div className="mb-3.5 flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-xl border border-border/70 bg-surface-muted/60 text-accent-ink">
                        <Icon name={tool?.icon ?? "layers"} className="size-5" />
                      </span>
                      <StatusBadge tone={STATUS_TONE[study.status]}>
                        {STATUS_LABEL[study.status]}
                      </StatusBadge>
                    </div>
                    <h3 className="break-words text-lg font-bold tracking-tight text-heading group-hover:underline">
                      {study.name}
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
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${metric.progress}%` }}
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted">
                      <span className="font-semibold text-foreground/80">{metric.label}</span>
                      <span>
                        <time dateTime={study.created_at}>
                          {new Date(study.created_at).toLocaleDateString("es-MX", {
                            timeZone: "America/Mexico_City",
                          })}
                        </time>
                      </span>
                    </div>
                  </div>
                </Link>
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
