import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectList } from "@/components/project-list";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";

export const metadata = { title: "Proyectos" };

type ProjectStudySummary = Pick<StudyRow, "project_id" | "status" | "tool_type" | "config">;

export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const [projectResult, studyCountsResult] = await Promise.all([
    supabase.from("projects").select("id, name, description, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<ProjectRow, "id" | "name" | "description" | "created_at">[]>(),
    supabase.from("studies").select("project_id, status, tool_type, config").returns<ProjectStudySummary[]>(),
  ]);

  const summaryByProject = new Map<string, { total: number; published: number; tools: Set<string> }>();
  for (const row of studyCountsResult.data ?? []) {
    const entry = summaryByProject.get(row.project_id) ?? { total: 0, published: 0, tools: new Set<string>() };
    entry.total += 1;
    if (row.status === "published") entry.published += 1;
    const toolLabel = getStudyTool(row)?.shortName ?? row.tool_type;
    if (toolLabel) entry.tools.add(toolLabel);
    summaryByProject.set(row.project_id, entry);
  }

  const projects = (projectResult.data ?? []).map((p) => {
    const summary = summaryByProject.get(p.id);
    return {
      ...p,
      studyCount: summary?.total ?? 0,
      publishedCount: summary?.published ?? 0,
      tools: summary ? [...summary.tools] : [],
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Proyectos</h1>
          <p className="mt-1.5 text-sm text-muted">
            {projects.length
              ? `${projects.length} ${projects.length === 1 ? "proyecto activo" : "proyectos activos"}`
              : "Organiza tus estudios por cliente, curso o línea de investigación."}
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {projectResult.error ? (
        <Alert tone="error">No pudimos cargar los proyectos. Vuelve a cargar la página.</Alert>
      ) : projects.length ? (
        <ProjectList projects={projects} />
      ) : (
        <EmptyState
          icon="folder"
          title="Aún no tienes proyectos"
          action={<NewProjectDialog />}
        >
          Crea el primero para agrupar los estudios de una investigación.
        </EmptyState>
      )}
    </div>
  );
}
