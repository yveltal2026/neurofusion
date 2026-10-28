import type { ReactNode } from "react";
import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import { IconTile } from "@/components/ui/icon-tile";
import { Tag } from "@/components/ui/tag";
import { getTool } from "@/tools/registry";
import { StudyTabs, type TabsVariant } from "./study-tabs";

/** Encabezado común de las páginas de un estudio (enlace al proyecto, título, pestañas). */
export function StudyHeader({
  study,
  projectName,
  active,
  variant,
  subtitle,
  actions,
}: {
  study: { id: string; project_id: string; name: string; tool_type: string };
  projectName?: string | null;
  active: Parameters<typeof StudyTabs>[0]["active"];
  variant: TabsVariant;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const tool = getTool(variant === "eye" ? "eyetracking" : study.tool_type);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <IconTile name={tool?.icon ?? "neuro"} size="lg" className="mt-1 hidden sm:inline-flex" />
          <div>
            <Breadcrumbs items={projectCrumbs(study.project_id, projectName)} />
            <h1 className="mt-1 break-words text-3xl font-bold tracking-tight">{study.name}</h1>
            <p className="mt-1 text-xs text-muted">
              <Tag>{tool?.name ?? study.tool_type}</Tag>
              {subtitle ? <> · {subtitle}</> : null}
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      </div>
      <StudyTabs id={study.id} active={active} variant={variant} />
    </div>
  );
}
