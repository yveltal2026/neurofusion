"use client";

import { useState } from "react";
import { RowLink, RowList } from "@/components/ui/rows";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/** Lista de proyectos con búsqueda por nombre o descripción (aparece desde 6 proyectos). */
export function ProjectList({ projects }: { projects: ProjectItem[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? projects.filter((p) => `${p.name} ${p.description ?? ""}`.toLowerCase().includes(needle)) : projects;
  return (
    <div className="space-y-4">
      {projects.length >= 6 ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyecto"
          aria-label="Buscar proyecto por nombre o descripción"
          className="h-11 w-full max-w-sm rounded-md border border-control bg-background px-3.5 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="text-muted" role="status">
          Ningún proyecto coincide con «{q}».
        </p>
      ) : (
        <RowList>
          {shown.map((p) => (
            <RowLink
              key={p.id}
              href={`/projects/${p.id}`}
              icon="folder"
              title={p.name}
              description={p.description ? <span className="line-clamp-1">{p.description}</span> : undefined}
              meta={`Creado el ${new Date(p.created_at).toLocaleDateString("es-MX")}`}
            />
          ))}
        </RowList>
      )}
    </div>
  );
}
