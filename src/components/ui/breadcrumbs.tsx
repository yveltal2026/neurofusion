import Link from "next/link";

export interface Crumb {
  label: string;
  /** Sin `href`, el elemento es la ubicación actual (no es un enlace). */
  href?: string;
}

/** Ruta de ubicación: Proyectos / nombre del proyecto / …; el título de la página es el último nivel. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta" className="print:hidden">
      <ol className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
            {i > 0 ? (
              <span aria-hidden="true" className="text-border">
                /
              </span>
            ) : null}
            {c.href ? (
              <Link href={c.href} className="inline-block max-w-[16rem] truncate py-1 hover:text-heading hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-[16rem] truncate py-1 text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Primeros niveles de la ruta de un proyecto. */
export function projectCrumbs(projectId: string, projectName?: string | null): Crumb[] {
  return [{ label: "Proyectos", href: "/projects" }, { label: projectName ?? "Proyecto", href: `/projects/${projectId}` }];
}

/** Ruta de las pantallas de «Nuevo estudio»: Proyectos / proyecto / Nuevo estudio (/ herramienta). */
export function newStudyCrumbs(projectId: string, projectName: string | null | undefined, tool?: string): Crumb[] {
  return [
    ...projectCrumbs(projectId, projectName),
    tool ? { label: "Nuevo estudio", href: `/projects/${projectId}/studies/new` } : { label: "Nuevo estudio" },
    ...(tool ? [{ label: tool }] : []),
  ];
}
