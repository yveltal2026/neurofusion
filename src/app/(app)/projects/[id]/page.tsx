import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { StudyGallery } from "@/components/study-gallery";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/brand/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { RowLink, RowList } from "@/components/ui/rows";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import type { BatteryRow, ProjectRow, StudyRow } from "@/lib/db/types";

const STATUS_LABEL = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;
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
    .select("id, name, tool_type, config, status, max_responses, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .returns<Pick<StudyRow, "id" | "name" | "tool_type" | "config" | "status" | "max_responses" | "created_at">[]>();

  const { data: batteries } = await supabase
    .from("batteries")
    .select("id, name, status")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .returns<Pick<BatteryRow, "id" | "name" | "status">[]>();

  const studyIds = (studies ?? []).map((s) => s.id);
  const [sessionsRes, assetsRes, auditsRes] = studyIds.length
    ? await Promise.all([
        supabase.from("sessions").select("study_id, status").in("study_id", studyIds),
        supabase.from("visual_assets").select("study_id").in("study_id", studyIds),
        supabase.from("seo_audits").select("study_id").in("study_id", studyIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const sessionCounts = new Map<string, number>();
  for (const row of sessionsRes.data ?? []) {
    if (row.status === "completed") {
      sessionCounts.set(row.study_id, (sessionCounts.get(row.study_id) ?? 0) + 1);
    }
  }
  const assetCounts = new Map<string, number>();
  for (const row of assetsRes.data ?? []) {
    assetCounts.set(row.study_id, (assetCounts.get(row.study_id) ?? 0) + 1);
  }
  const auditCounts = new Map<string, number>();
  for (const row of auditsRes.data ?? []) {
    auditCounts.set(row.study_id, (auditCounts.get(row.study_id) ?? 0) + 1);
  }

  const studyList = (studies ?? []).map((s) => ({
    ...s,
    metricCount:
      s.tool_type === "visual"
        ? (assetCounts.get(s.id) ?? 0)
        : s.tool_type === "seo"
          ? (auditCounts.get(s.id) ?? 0)
          : (sessionCounts.get(s.id) ?? 0),
  }));
  const publishedCount = studyList.filter((s) => s.status === "published").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Proyectos", href: "/projects" }]} />
          <h1 className="page-title mt-2 break-words">{project.name}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {studyList.length
              ? `${studyList.length} ${studyList.length === 1 ? "estudio" : "estudios"} · ${publishedCount} ${publishedCount === 1 ? "publicado" : "publicados"}`
              : "Sin estudios aún"}
            {project.description ? ` — ${project.description}` : ""}
          </p>
        </div>
        <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("primary")}>
          <Icon name="plus" className="size-5" />
          Nuevo estudio
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Estudios</h2>
        {studyList.length === 0 ? (
          <EmptyState
            icon="layers"
            title="Este proyecto aún no tiene estudios"
            action={
              <Link href={`/projects/${project.id}/studies/new`} className={buttonClass("primary")}>
                <Icon name="plus" className="size-5" />
                Crear primer estudio
              </Link>
            }
          >
            Elige una herramienta (IAT, encuesta, SEO o análisis visual) y arma tu primer estudio.
          </EmptyState>
        ) : (
          <StudyGallery studies={studyList} />
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
          <EmptyState
            icon="layers"
            title="Este proyecto aún no tiene baterías"
            action={
              <Link href={`/projects/${project.id}/batteries/new`} className={buttonClass("secondary")}>
                <Icon name="plus" className="size-4" />
                Nueva batería
              </Link>
            }
          >
            Una batería une varios estudios (IAT, variantes, encuestas e imágenes con IA) en una sola liga.
          </EmptyState>
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

      <section aria-labelledby="danger-zone" className="border-t border-border pt-6">
        <h2 id="danger-zone" className="sr-only">Zona de peligro</h2>
        <DeleteProjectDialog
          projectId={project.id}
          projectName={project.name}
          studyCount={studyList.length}
        />
      </section>
    </div>
  );
}
