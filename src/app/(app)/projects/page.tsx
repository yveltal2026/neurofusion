import { ProjectList } from "@/components/project-list";
import { NewProjectForm } from "@/components/new-project-form";
import { Block } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
        <h1 className="text-3xl font-bold tracking-tight">Proyectos de investigación</h1>
        <p className="mt-1 text-sm text-muted">Un proyecto agrupa las herramientas (estudios) de una misma investigación.</p>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon="folder" title="Aún no tienes proyectos">
          Un proyecto agrupa los estudios de una misma investigación. Crea el primero con el formulario de abajo.
        </EmptyState>
      ) : (
        <ProjectList projects={projects} />
      )}

      <Block className="max-w-lg">
        <SectionTitle icon="plus" className="mb-4">
          Nuevo proyecto
        </SectionTitle>
        <NewProjectForm />
      </Block>
    </div>
  );
}
