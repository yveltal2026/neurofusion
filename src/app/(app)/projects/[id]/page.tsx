import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";
import { getTool } from "@/tools/registry";
import { deleteProject } from "../actions";

const STATUS_LABEL = { draft: "borrador", published: "publicado", closed: "cerrado" } as const;

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("id", id)
    .maybeSingle<Pick<ProjectRow, "id" | "name" | "description">>();
  if (!project) notFound();

  const { data: studies } = await supabase
    .from("studies")
    .select("id, name, tool_type, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .returns<Pick<StudyRow, "id" | "name" | "tool_type" | "status" | "created_at">[]>();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-muted hover:underline">
            ← Proyectos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description ? <p className="mt-1 text-sm text-muted">{project.description}</p> : null}
        </div>
        <form action={deleteProject}>
          <input type="hidden" name="id" value={project.id} />
          <Button type="submit" variant="ghost" className="text-red-600">
            Eliminar proyecto
          </Button>
        </form>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Estudios</h2>
          <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("primary")}>
            Nuevo estudio
          </Link>
        </div>
        {(studies ?? []).length === 0 ? (
          <Card className="text-sm text-muted">Este proyecto aún no tiene estudios.</Card>
        ) : (
          <ul className="space-y-2">
            {(studies ?? []).map((s) => (
              <li key={s.id}>
                <Link href={`/studies/${s.id}`} className="block">
                  <Card className="flex items-center justify-between transition hover:border-primary">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs uppercase text-muted">
                      {getTool(s.tool_type)?.shortName ?? s.tool_type}
                      {s.tool_type === "iat" ? ` · ${STATUS_LABEL[s.status]}` : ""}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
