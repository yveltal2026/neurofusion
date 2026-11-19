import type { ReactNode } from "react";
import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StudyStatus } from "@/lib/db/types";
import { getStudyTool } from "@/tools/registry";

/** Encabezado común de las páginas de un estudio (proyecto, título y acciones). */
export function StudyHeader({
  study,
  projectName,
  subtitle,
  actions,
}: {
  study: { id: string; project_id: string; name: string; tool_type: string; config: unknown; status?: StudyStatus };
  projectName?: string | null;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const tool = getStudyTool(study);
  const status = study.status && { published: "Publicado", closed: "Cerrado", draft: "Borrador" }[study.status];
  return (
    <div className="space-y-3">
      <Breadcrumbs items={projectCrumbs(study.project_id, projectName)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title break-words">{study.name}</h1>
            {status ? <StatusBadge tone={study.status === "published" ? "success" : "neutral"}>{status}</StatusBadge> : null}
          </div>
          <p className="text-sm text-muted">
            {tool?.name ?? study.tool_type}
            {subtitle ? <> · {subtitle}</> : null}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      </div>
    </div>
  );
}
