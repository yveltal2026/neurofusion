import Link from "next/link";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectList } from "@/components/project-list";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";

export const metadata = { title: "Proyectos" };

type RecentStudy = Pick<StudyRow, "id" | "name" | "tool_type" | "config" | "status" | "updated_at">;
const STATUS = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;

export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const [projectResult, studyResult] = await Promise.all([
    supabase.from("projects").select("id, name, description, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<ProjectRow, "id" | "name" | "description" | "created_at">[]>(),
    supabase.from("studies").select("id, name, tool_type, config, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5)
      .returns<RecentStudy[]>(),
  ]);
  const projects = projectResult.data ?? [];
  const recent = studyResult.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Proyectos</h1>
          <p className="mt-2 text-muted">
            {projects.length ? `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}` : "Organiza tus estudios en proyectos."}
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {projectResult.error ? (
        <Alert tone="error">No pudimos cargar los proyectos. Vuelve a cargar la página.</Alert>
      ) : projects.length ? (
        <ProjectList projects={projects} />
      ) : (
        <EmptyState icon="folder" title="Aún no tienes proyectos">Crea el primero para agrupar los estudios de una investigación.</EmptyState>
      )}

      {recent.length ? (
        <section className="glass-panel min-w-0 rounded-lg p-4 sm:p-6" aria-labelledby="recent-studies">
          <h2 id="recent-studies" className="mb-3 text-lg font-bold">Estudios recientes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th scope="col" className="pb-2 pr-4">Estudio</th>
                  <th scope="col" className="pb-2 pr-4">Herramienta</th>
                  <th scope="col" className="pb-2 pr-4">Estado</th>
                  <th scope="col" className="pb-2 whitespace-nowrap">Último cambio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((study) => (
                  <tr key={study.id}>
                    <th scope="row" className="py-2 pr-4 text-left">
                      <Link href={`/studies/${study.id}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">{study.name}</Link>
                    </th>
                    <td className="py-2 pr-4 text-muted">{getStudyTool(study)?.shortName ?? study.tool_type}</td>
                    <td className="py-2 pr-4"><StatusBadge tone={study.status === "published" ? "success" : "neutral"}>{STATUS[study.status]}</StatusBadge></td>
                    <td className="py-2 whitespace-nowrap text-muted">
                      <time dateTime={study.updated_at}>{new Date(study.updated_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
