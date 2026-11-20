"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandIllustration } from "@/components/brand/illustration";
import { Icon } from "@/components/brand/icon";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  studyCount?: number;
}

type ProjectScope = "all" | "with-studies" | "empty";

const SCOPE_OPTIONS: { value: ProjectScope; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "with-studies", label: "Con estudios" },
  { value: "empty", label: "Sin estudios" },
];

export function ProjectList({ projects }: { projects: ProjectItem[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ProjectScope>("all");
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
  const shown = projects.filter(({ name, description, studyCount = 0 }) => {
    if (scope === "with-studies" && studyCount === 0) return false;
    if (scope === "empty" && studyCount > 0) return false;
    if (needle) {
      return `${name} ${description ?? ""}`.toLocaleLowerCase("es-MX").includes(needle);
    }
    return true;
  });

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
            className="min-h-10 w-full rounded-full border border-border/80 bg-surface/90 py-1.5 pr-4 pl-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/25"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar proyectos"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/70 bg-surface-muted/75 p-1 backdrop-blur-md"
        >
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setScope(option.value)}
                className={`min-h-8 rounded-full px-3.5 text-xs font-semibold transition-[background-color,color,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
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
          {needle || scope !== "all"
            ? `${shown.length} de ${projects.length} proyectos`
            : `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`}
        </p>
      </div>

      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Proyectos">
          {shown.map(({ id, name, description, created_at, studyCount }) => (
            <li key={id}>
              <Link
                href={`/projects/${id}`}
                className="group flex h-full min-w-0 flex-col justify-between gap-4 rounded-[18px] border border-border/80 bg-surface p-5 shadow-[0_14px_34px_-22px_rgba(122,62,18,0.22)] transition-[border-color,box-shadow,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] hover:border-accent-ink/60 hover:shadow-[0_18px_40px_-22px_rgba(122,62,18,0.3)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl border border-border/70 bg-neuro-wash">
                      <BrandIllustration name="mod-proyectos" className="block w-10" />
                    </span>
                    {typeof studyCount === "number" ? (
                      <span className="rounded-full border border-border/80 bg-surface-muted/60 px-3 py-1 text-xs font-semibold tabular-nums text-muted">
                        {studyCount} {studyCount === 1 ? "estudio" : "estudios"}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="break-words text-xl font-bold tracking-tight text-heading group-hover:underline">
                    {name}
                  </h2>
                  {description ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted">{description}</p>
                  ) : null}
                </div>

                <p className="text-xs text-muted">
                  Creado el{" "}
                  <time dateTime={created_at}>
                    {new Date(created_at).toLocaleDateString("es-MX", {
                      timeZone: "America/Mexico_City",
                    })}
                  </time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted" role="status">
          Ningún proyecto coincide con «{query}».
        </p>
      )}
    </div>
  );
}
