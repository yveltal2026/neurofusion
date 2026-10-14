import Link from "next/link";
import { NewProjectForm } from "@/components/new-project-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow } from "@/lib/db/types";

export const metadata = { title: "Proyectos · NeuroFusion" };

export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false })
    .returns<Pick<ProjectRow, "id" | "name" | "description" | "created_at">[]>();
  const projects = data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos de investigación</h1>
        <p className="mt-1 text-sm text-muted">Un proyecto agrupa las herramientas (estudios) de una misma investigación.</p>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon="folder" title="Aún no tienes proyectos">
          Un proyecto agrupa los estudios de una misma investigación. Crea el primero con el formulario de abajo.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block">
                <Card className="flex h-full gap-4 transition hover:border-primary">
                  <IconTile name="folder" />
                  <div className="min-w-0">
                    <h2 className="font-medium">{p.name}</h2>
                    {p.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p> : null}
                    <p className="mt-3 text-xs text-muted">Creado el {new Date(p.created_at).toLocaleDateString("es-MX")}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card className="max-w-lg">
        <SectionTitle icon="plus" className="mb-4">
          Nuevo proyecto
        </SectionTitle>
        <NewProjectForm />
      </Card>
    </div>
  );
}
