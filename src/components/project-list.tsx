"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icon";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  studyCount?: number;
  publishedCount?: number;
  responseCount?: number;
  tools?: string[];
}

type ProjectScope = "all" | "with-studies" | "empty";
type ProjectSort = "recent" | "responses" | "name";

const SCOPE_OPTIONS: { value: ProjectScope; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "with-studies", label: "Con estudios" },
  { value: "empty", label: "Sin estudios" },
];

function isProjectScope(value: string | null): value is ProjectScope {
  return value === "all" || value === "with-studies" || value === "empty";
}

function isProjectSort(value: string | null): value is ProjectSort {
  return value === "recent" || value === "responses" || value === "name";
}

export function ProjectList({ projects }: { projects: ProjectItem[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ProjectScope>("all");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const hydrated = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") ?? "";
    const initialScope = params.get("scope");
    const initialSort = params.get("sort");
    if (initialQuery) setQuery(initialQuery);
    if (isProjectScope(initialScope)) setScope(initialScope);
    if (isProjectSort(initialSort)) setSort(initialSort);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams(window.location.search);
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    if (scope !== "all") params.set("scope", scope);
    else params.delete("scope");
    if (sort !== "recent") params.set("sort", sort);
    else params.delete("sort");
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [query, scope, sort]);

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
  const hasActiveFilter = Boolean(needle) || scope !== "all";
  const shown = projects
    .filter(({ name, description, studyCount = 0, tools = [] }) => {
      if (scope === "with-studies" && studyCount === 0) return false;
      if (scope === "empty" && studyCount > 0) return false;
      if (needle) {
        return `${name} ${description ?? ""} ${tools.join(" ")}`.toLocaleLowerCase("es-MX").includes(needle);
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "responses") return (b.responseCount ?? 0) - (a.responseCount ?? 0);
      if (sort === "name") return a.name.localeCompare(b.name, "es-MX");
      return b.created_at.localeCompare(a.created_at);
    });

  function clearFilters() {
    setQuery("");
    setScope("all");
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
            placeholder="Buscar proyecto..."
            aria-label="Buscar proyecto por nombre o descripción"
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
          aria-label="Filtrar proyectos"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/70 bg-surface-muted/85 p-1"
        >
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setScope(option.value)}
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
            aria-label="Ordenar proyectos"
            value={sort}
            onChange={(event) => setSort(event.target.value as ProjectSort)}
            className="min-h-11 rounded-full border border-border/80 bg-surface/90 px-3.5 text-xs font-semibold text-heading outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/25 motion-reduce:transition-none"
          >
            <option value="recent">Más recientes</option>
            <option value="responses">Más respuestas</option>
            <option value="name">Nombre A–Z</option>
          </select>

          <p aria-live="polite" className="text-xs font-semibold tabular-nums text-muted">
            {hasActiveFilter
              ? `${shown.length} de ${projects.length} proyectos`
              : `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`}
          </p>
        </div>
      </div>

      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Proyectos">
          {shown.map(({ id, name, description, created_at, studyCount = 0, publishedCount = 0, responseCount = 0, tools = [] }) => {
            const statusIcon = publishedCount > 0 ? "target" : studyCount > 0 ? "layers" : "folder";
            const statusTile =
              publishedCount > 0
                ? "border-success/35 bg-success/10 text-success"
                : studyCount > 0
                  ? "border-border/70 bg-surface-muted/60 text-accent-ink"
                  : "border-border/70 bg-surface-muted/40 text-muted";
            return (
            <li key={id} className="relative">
              <article className="group relative flex h-full min-w-0 flex-col justify-between gap-4 rounded-[18px] border border-border/80 bg-surface p-5 shadow-[0_14px_34px_-22px_rgba(122,62,18,0.22)] transition-[border-color,box-shadow,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] focus-within:border-accent-ink focus-within:ring-2 focus-within:ring-accent-ink/25 hover:border-accent-ink/60 hover:shadow-[0_18px_40px_-22px_rgba(122,62,18,0.3)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className={`grid size-11 place-items-center rounded-2xl border ${statusTile}`}>
                      <Icon name={statusIcon} className="size-5" />
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {typeof studyCount === "number" ? (
                        <span className="rounded-full border border-border/80 bg-surface-muted/60 px-3 py-1 text-xs font-semibold tabular-nums text-muted">
                          {studyCount} {studyCount === 1 ? "estudio" : "estudios"}
                        </span>
                      ) : null}
                      {publishedCount > 0 ? (
                        <StatusBadge tone="success">
                          {publishedCount} {publishedCount === 1 ? "publicado" : "publicados"}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                  <h2 className="break-words text-xl font-bold tracking-tight text-heading">
                    <Link
                      href={`/projects/${id}`}
                      className="after:absolute after:inset-0 focus:outline-none group-hover:underline"
                    >
                      {name}
                    </Link>
                  </h2>
                  {description ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted">{description}</p>
                  ) : null}
                  {tools.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tools.slice(0, 2).map((tool) => (
                        <span
                          key={tool}
                          className="rounded-md border border-border/70 bg-surface-muted/50 px-2 py-0.5 text-xs font-medium text-muted"
                        >
                          {tool}
                        </span>
                      ))}
                      {tools.length > 2 ? (
                        <span
                          title={tools.slice(2).join(", ")}
                          className="relative z-10 px-1 py-0.5 text-xs font-medium text-muted"
                        >
                          +{tools.length - 2}
                          <span className="sr-only"> ({tools.slice(2).join(", ")})</span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs tabular-nums text-muted">
                  <p>
                    {responseCount > 0 ? (
                      <>
                        <span className="font-semibold text-foreground/80">
                          {responseCount} {responseCount === 1 ? "respuesta" : "respuestas"}
                        </span>
                        {" · "}
                      </>
                    ) : null}
                    Creado el{" "}
                    <time dateTime={created_at}>
                      {new Date(created_at).toLocaleDateString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}
                    </time>
                  </p>
                  <Icon
                    name="arrow"
                    className="size-4 shrink-0 text-muted transition-transform duration-[var(--duracion-micro)] group-hover:translate-x-0.5 group-hover:text-heading motion-reduce:transition-none"
                  />
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
              ? `Ningún proyecto coincide con «${query.trim()}».`
              : "No hay proyectos en este filtro."}
          </p>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
