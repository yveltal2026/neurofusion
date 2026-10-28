import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/brand/icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RowLink, RowList } from "@/components/ui/rows";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import type { BatteryRow, ProjectRow, StudyRow } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";
import { deleteProject } from "../actions";

const STATUS_LABEL = { draft: "borrador", published: "publicado", closed: "cerrado" } as const;
const STATUS_TONE = { draft: "neutral", published: "success", closed: "warning" } as const;

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
          <Breadcrumbs items={[{ label: "Proyectos", href: "/projects" }]} />
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{project.name}</h1>
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
          <h2 className="text-xl font-semibold">Estudios</h2>
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
          <RowList>
            {(studies ?? []).map((s) => (
              <RowLink
                key={s.id}
                href={`/studies/${s.id}`}
                icon={getStudyTool(s)?.icon ?? "layers"}
                title={s.name}
                meta={
                  <>
                    {getStudyTool(s)?.shortName ?? s.tool_type}
                    {s.tool_type === "iat" ? <StatusBadge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</StatusBadge> : null}
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Baterías</h2>
          <Link href={`/projects/${project.id}/batteries/new`} className={buttonClass("secondary")}>
            Nueva batería
          </Link>
        </div>
        {(batteries ?? []).length === 0 ? (
          <Card className="text-sm text-muted">Una batería une varios estudios (IAT, variantes, encuestas e imágenes con IA) en una sola liga. Aún no hay ninguna.</Card>
        ) : (
          <RowList>
            {(batteries ?? []).map((b) => (
              <RowLink
                key={b.id}
                href={`/batteries/${b.id}`}
                icon="layers"
                title={b.name}
                meta={
                  <>
                    Batería
                    <StatusBadge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</StatusBadge>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>
    </div>
  );
}
