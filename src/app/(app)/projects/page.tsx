import Link from "next/link";
import { NewProjectForm } from "@/components/new-project-form";
import { Card } from "@/components/ui/card";
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
        <p className="mt-1 text-sm text-muted">
          Un proyecto agrupa las herramientas (estudios) de una misma investigación.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card className="text-sm text-muted">Aún no tienes proyectos. Crea el primero abajo.</Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block">
                <Card className="h-full transition hover:border-primary">
                  <h2 className="font-medium">{p.name}</h2>
                  {p.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p> : null}
                  <p className="mt-3 text-xs text-muted">
                    Creado el {new Date(p.created_at).toLocaleDateString("es-MX")}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card className="max-w-lg">
        <h2 className="mb-4 font-medium">Nuevo proyecto</h2>
        <NewProjectForm />
      </Card>
    </div>
  );
}
