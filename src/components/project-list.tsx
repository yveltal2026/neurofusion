"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandIllustration } from "@/components/brand/illustration";
import { Input } from "@/components/ui/field";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function ProjectList({ projects }: { projects: ProjectItem[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("es-MX");
  const shown = projects.filter(({ name, description }) => `${name} ${description ?? ""}`.toLocaleLowerCase("es-MX").includes(needle));

  return (
    <div className="space-y-4">
      {projects.length >= 6 ? (
        <div className="max-w-sm">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar proyecto"
            aria-label="Buscar proyecto por nombre o descripción"
          />
        </div>
      ) : null}
      {shown.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Proyectos">
          {shown.map(({ id, name, description, created_at }) => (
            <li key={id}>
              <Link
                href={`/projects/${id}`}
                className="glass-panel group block h-full min-w-0 rounded-lg p-4 transition-colors hover:border-accent-ink motion-reduce:transition-none"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="grid size-12 place-items-center rounded-md border border-border bg-neuro-wash">
                    <BrandIllustration name="mod-proyectos" className="block w-11" />
                  </span>
                  <span aria-hidden="true" className="mr-1 size-2 rotate-45 border-t border-r border-current text-muted group-hover:text-heading" />
                </div>
                <h2 className="break-words text-lg font-bold group-hover:underline">{name}</h2>
                {description ? <p className="line-clamp-2 text-sm text-muted">{description}</p> : null}
                <p className="mt-3 text-xs text-muted">
                  Creado el <time dateTime={created_at}>{new Date(created_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted" role="status">Ningún proyecto coincide con «{query}».</p>
      )}
    </div>
  );
}
