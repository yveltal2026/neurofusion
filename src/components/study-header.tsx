import type { ReactNode } from "react";
import { Icon } from "@/components/brand/icon";
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <Breadcrumbs items={projectCrumbs(study.project_id, projectName)} />
        {status ? (
          <StatusBadge tone={study.status === "published" ? "success" : "neutral"}>
            {status}
          </StatusBadge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="mt-0.5 hidden size-11 shrink-0 place-items-center rounded-2xl border border-border/80 bg-neuro-wash text-accent-ink sm:grid">
            <Icon name={tool?.icon ?? "layers"} className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="page-title break-words">{study.name}</h1>
            <p className="text-sm text-muted">
              {tool?.name ?? study.tool_type}
              {subtitle ? <> · {subtitle}</> : null}
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      </div>
    </div>
  );
}
