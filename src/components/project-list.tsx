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

export function ProjectList({ projects }: { projects: ProjectItem[] }) {
  const [query, setQuery] = useState("");
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
  const shown = projects.filter(({ name, description }) =>
    `${name} ${description ?? ""}`.toLocaleLowerCase("es-MX").includes(needle),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
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
              if (event.key === "Escape" && query) {
                setQuery("");
              }
            }}
            placeholder="Buscar proyecto..."
            aria-label="Buscar proyecto por nombre o descripción"
            className="min-h-11 w-full rounded-full border border-border bg-surface py-2 pr-4 pl-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--duracion-micro)] placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/30"
          />
        </div>
        <p className="text-xs font-semibold tabular-nums text-muted">
          {needle
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
                className="group flex h-full min-w-0 flex-col justify-between gap-4 rounded-lg border border-border bg-surface p-5 transition-[border-color,transform] duration-[var(--duracion-micro)] ease-[var(--ease-enfocar)] hover:border-accent-ink/70 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="grid size-11 place-items-center rounded-xl border border-border bg-neuro-wash">
                      <BrandIllustration name="mod-proyectos" className="block w-10" />
                    </span>
                    {typeof studyCount === "number" ? (
                      <span className="rounded-full border border-border bg-surface-muted/70 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
                        {studyCount} {studyCount === 1 ? "estudio" : "estudios"}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="break-words text-lg font-bold text-heading group-hover:underline">
                    {name}
                  </h2>
                  {description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{description}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                  <p className="text-xs text-muted">
                    Creado el{" "}
                    <time dateTime={created_at}>
                      {new Date(created_at).toLocaleDateString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}
                    </time>
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted/60 px-3 py-1 text-xs font-semibold text-heading transition-colors duration-[var(--duracion-micro)] group-hover:border-accent-ink/50 group-hover:bg-neuro-tint">
                    Abrir
                  </span>
                </div>
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
