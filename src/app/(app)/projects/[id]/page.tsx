import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/brand/icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { requireUser } from "@/lib/auth/session";
import type { BatteryRow, ProjectRow, StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";
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
    .select("id, name, tool_type, config, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .returns<Pick<StudyRow, "id" | "name" | "tool_type" | "config" | "status" | "created_at">[]>();

  const { data: batteries } = await supabase
    .from("batteries")
    .select("id, name, status")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .returns<Pick<BatteryRow, "id" | "name" | "status">[]>();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="inline-block py-1 text-sm text-muted hover:underline">
            ← Proyectos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description ? <p className="mt-1 text-sm text-muted">{project.description}</p> : null}
        </div>
        <form action={deleteProject}>
          <input type="hidden" name="id" value={project.id} />
          <Button type="submit" variant="ghost" className="text-danger">
            <Icon name="trash" className="size-5" />
            Eliminar proyecto
          </Button>
        </form>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Estudios</h2>
          <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("primary")}>
            <Icon name="plus" className="size-5" />
            Nuevo estudio
          </Link>
        </div>
        {(studies ?? []).length === 0 ? (
          <EmptyState
            icon="layers"
            title="Este proyecto aún no tiene estudios"
            action={
              <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("secondary")}>
                <Icon name="plus" className="size-5" />
                Crear el primer estudio
              </Link>
            }
          >
            Elige una herramienta (IAT, encuesta, SEO o análisis visual) y arma tu primer estudio.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {(studies ?? []).map((s) => (
              <li key={s.id}>
                <Link href={`/studies/${s.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 py-4 transition hover:border-primary">
                    <span className="flex min-w-0 items-center gap-3">
                      <IconTile name={getStudyTool(s)?.icon ?? "layers"} size="sm" />
                      <span className="truncate font-medium">{s.name}</span>
                    </span>
                    <span className="text-xs uppercase text-muted">
                      {getStudyTool(s)?.shortName ?? s.tool_type}
                      {s.tool_type === "iat" ? ` · ${STATUS_LABEL[s.status]}` : ""}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Baterías</h2>
          <Link href={`/projects/${project.id}/batteries/new`} className={buttonClass("secondary")}>
            Nueva batería
          </Link>
        </div>
        {(batteries ?? []).length === 0 ? (
          <Card className="text-sm text-muted">Una batería une varios estudios (IAT, variantes, encuestas e imágenes con IA) en una sola liga. Aún no hay ninguna.</Card>
        ) : (
          <ul className="space-y-2">
            {(batteries ?? []).map((b) => (
              <li key={b.id}>
                <Link href={`/batteries/${b.id}`} className="block">
                  <Card className="flex items-center justify-between transition hover:border-primary">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs uppercase text-muted">Batería · {STATUS_LABEL[b.status]}</span>
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
