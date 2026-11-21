import Link from "next/link";
import { Icon } from "@/components/brand/icon";
import { NewProjectForm } from "@/components/new-project-form";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { ProjectList } from "@/components/project-list";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";
import { getOrSyncOnboardingState } from "@/lib/onboarding/actions";
import { canCreateProjectUnderLimits } from "@/lib/plans/quotas";
import { getOrgBillingSummary } from "@/lib/plans/server";
import { getStudyTool } from "@/tools/registry";

export const metadata = { title: "Proyectos" };

type RecentStudy = Pick<StudyRow, "id" | "name" | "tool_type" | "config" | "status" | "updated_at">;
const STATUS = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;

export default async function ProjectsPage() {
  const { supabase, user, orgId } = await requireUser();
  const [projectResult, studyResult, billing] = await Promise.all([
    supabase.from("projects").select("id, name, description, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<ProjectRow, "id" | "name" | "description" | "created_at">[]>(),
    supabase.from("studies").select("id, name, tool_type, config, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5)
      .returns<RecentStudy[]>(),
    getOrgBillingSummary(supabase, orgId, user.id),
  ]);
  const projects = projectResult.data ?? [];
  const recent = studyResult.data ?? [];
  const onboarding = await getOrSyncOnboardingState(supabase, orgId, user.id, {
    projectsCount: billing.usage.projectsCount,
    studiesCount: billing.usage.studiesCount,
  });
  const canCreateMoreProjects = canCreateProjectUnderLimits(
    billing.limits,
    billing.usage.projectsCount,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Proyectos</h1>
          <p className="mt-2 text-muted">
            {projects.length ? `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}` : "Organiza tus estudios en proyectos."}
          </p>
        </div>
        {canCreateMoreProjects ? (
          <a href="#nuevo-proyecto" className={buttonClass()}>
            <Icon name="plus" className="size-4" />
            Nuevo proyecto
          </a>
        ) : (
          <Link href="/membresia" className={buttonClass("secondary")}>
            Ampliar plan ({billing.usage.projectsCount}/{billing.limits.maxProjects} proyecto)
          </Link>
        )}
      </div>

      <OnboardingChecklist
        completedMissions={onboarding.completedMissions}
        tourCompletedAt={onboarding.tourCompletedAt}
        checklistDismissedAt={onboarding.checklistDismissedAt}
        firstProjectId={projects[0]?.id ?? null}
      />

      {projectResult.error ? (
        <Alert tone="error">No pudimos cargar los proyectos. Vuelve a cargar la página.</Alert>
      ) : projects.length ? (
        <ProjectList projects={projects} />
      ) : (
        <EmptyState icon="folder" title="Aún no tienes proyectos">Crea el primero para agrupar los estudios de una investigación.</EmptyState>
      )}

      {recent.length ? (
        <section className="glass-panel min-w-0 rounded-panel p-4 sm:p-6" aria-labelledby="recent-studies">
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

      <section id="nuevo-proyecto" className="glass-panel max-w-xl scroll-mt-4 rounded-panel p-5 sm:p-6" tabIndex={-1} aria-labelledby="new-project-heading">
        <h2 id="new-project-heading" className="mb-4 text-lg font-bold">Nuevo proyecto</h2>
        {canCreateMoreProjects ? (
          <NewProjectForm />
        ) : (
          <div className="space-y-3 text-sm text-muted">
            <p>
              Tu cuenta <strong>{billing.planName}</strong> alcanzó el límite de{" "}
              {billing.limits.maxProjects} proyecto. Para crear proyectos adicionales,
              solicita crecer tu membresía o canjea un código de activación.
            </p>
            <Link href="/membresia" className={buttonClass()}>
              Ir a Membresía y planes
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
