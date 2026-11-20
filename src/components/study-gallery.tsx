"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/brand/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";

export type StudyGalleryItem = Pick<
  StudyRow,
  "id" | "name" | "tool_type" | "config" | "status" | "created_at"
>;

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

function secondaryAction(study: StudyGalleryItem): { href: string; label: string } | null {
  const tool = getStudyTool(study);
  switch (tool?.type) {
    case "survey":
    case "visual":
    case "eyetracking":
      return { href: `/studies/${study.id}/report`, label: "Ver informe" };
    case "iat":
      return { href: `/studies/${study.id}/analysis`, label: "Análisis" };
    case "iat_variant":
      return { href: `/studies/${study.id}/responses`, label: "Resultados" };
    default:
      return null;
  }
}

export function StudyGallery({ studies }: { studies: StudyGalleryItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [toolFilter, setToolFilter] = useState<string>("all");
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

  const availableTools = useMemo(() => {
    const seen = new Map<string, string>();
    for (const study of studies) {
      const tool = getStudyTool(study);
      const key = tool?.type ?? study.tool_type;
      const label = tool?.shortName ?? study.tool_type;
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.entries()).map(([type, label]) => ({ type, label }));
  }, [studies]);

  const needle = query.trim().toLocaleLowerCase("es-MX");
  const shown = studies.filter((study) => {
    if (status !== "all" && study.status !== status) return false;
    const tool = getStudyTool(study);
    const toolKey = tool?.type ?? study.tool_type;
    if (toolFilter !== "all" && toolKey !== toolFilter) return false;
    if (needle) {
      const haystack = `${study.name} ${tool?.shortName ?? ""} ${tool?.name ?? ""}`.toLocaleLowerCase("es-MX");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs sm:max-w-sm">
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
            className="min-h-11 w-full rounded-full border border-border bg-surface py-2 pr-14 pl-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/30"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted sm:inline-block"
          >
            ⌘K
          </kbd>
        </div>

        <div
          role="group"
          aria-label="Filtrar estudios por estado"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface-muted/80 p-1"
        >
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(option.value)}
                className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition-[background-color,color,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
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
      </div>

      {availableTools.length > 1 ? (
        <div role="group" aria-label="Filtrar por herramienta" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={toolFilter === "all"}
            onClick={() => setToolFilter("all")}
            className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors duration-[var(--duracion-micro)] active:scale-[0.97] motion-reduce:transition-none ${
              toolFilter === "all"
                ? "border-primary/60 bg-neuro-tint text-heading"
                : "border-border bg-surface text-muted hover:text-heading"
            }`}
          >
            Todas las herramientas
          </button>
          {availableTools.map(({ type, label }) => {
            const active = toolFilter === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => setToolFilter(type)}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors duration-[var(--duracion-micro)] active:scale-[0.97] motion-reduce:transition-none ${
                  active
                    ? "border-primary/60 bg-neuro-tint text-heading"
                    : "border-border bg-surface text-muted hover:text-heading"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Estudios del proyecto">
          {shown.map((study) => {
            const tool = getStudyTool(study);
            const secondary = secondaryAction(study);
            return (
              <li
                key={study.id}
                className="flex min-w-0 flex-col justify-between gap-4 rounded-lg border border-border bg-surface p-5 transition-colors duration-[var(--duracion-micro)] hover:border-accent-ink/60"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="grid size-10 place-items-center rounded-xl border border-border bg-neuro-wash text-accent-ink">
                      <Icon name={tool?.icon ?? "layers"} className="size-5" />
                    </span>
                    <StatusBadge tone={STATUS_TONE[study.status]}>
                      {STATUS_LABEL[study.status]}
                    </StatusBadge>
                  </div>
                  <h3 className="break-words text-base font-bold text-heading">
                    <Link href={`/studies/${study.id}`} className="hover:underline">
                      {study.name}
                    </Link>
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {tool?.shortName ?? study.tool_type}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <p className="text-xs text-muted">
                    Creado el{" "}
                    <time dateTime={study.created_at}>
                      {new Date(study.created_at).toLocaleDateString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}
                    </time>
                  </p>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/studies/${study.id}`}
                      className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-heading transition-[background-color,border-color,transform] duration-[var(--duracion-micro)] hover:border-accent-ink/50 hover:bg-neuro-tint active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
                    >
                      Abrir
                    </Link>
                    {secondary ? (
                      <Link
                        href={secondary.href}
                        className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-heading transition-[background-color,border-color,transform] duration-[var(--duracion-micro)] hover:border-accent-ink/50 hover:bg-surface-muted active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
                      >
                        {secondary.label}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted" role="status">
          Ningún estudio coincide con los filtros actuales.
        </p>
      )}
    </div>
  );
}
