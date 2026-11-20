import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";
import { getTool } from "@/tools/registry";
import { deleteProject } from "../actions";

const STATUS_META = {
  draft: { label: "Borrador", tone: "bg-surface-2 text-muted border-border" },
  published: { label: "Publicado", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  closed: { label: "Cerrado", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
} as const;

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

  const studyList = studies ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-muted hover:underline">
            ← Proyectos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description ? <p className="mt-1 text-sm text-muted">{project.description}</p> : null}
        </div>
        <ConfirmAction
          action={deleteProject}
          hiddenFields={{ id: project.id }}
          triggerLabel="Eliminar proyecto"
          triggerVariant="danger"
          title="¿Eliminar proyecto y todos sus estudios?"
          description={`Se eliminarán permanentemente ${studyList.length} ${
            studyList.length === 1 ? "estudio" : "estudios"
          } y todos sus datos recolectados. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar proyecto"
          pendingLabel="Eliminando…"
          confirmVariant="danger"
          requireText={project.name}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Estudios</h2>
          <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("primary")}>
            Nuevo estudio
          </Link>
        </div>
        {studyList.length === 0 ? (
          <Card className="space-y-2 text-sm text-muted">
            <p>Este proyecto aún no tiene estudios.</p>
            <Link href={`/projects/${project.id}/studies/new`} className="inline-block font-medium text-primary hover:underline">
              Crear el primer estudio →
            </Link>
          </Card>
        ) : (
          <ul className="space-y-2">
            {studyList.map((s) => {
              const status = STATUS_META[s.status];
              const toolName = getTool(s.tool_type)?.name ?? s.tool_type;
              return (
                <li key={s.id}>
                  <Link href={`/studies/${s.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-primary">
                      <div>
                        <span className="font-medium">{s.name}</span>
                        <p className="mt-0.5 text-xs text-muted">
                          {toolName} · Creado el {new Date(s.created_at).toLocaleDateString("es-MX")}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                        {status.label}
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
