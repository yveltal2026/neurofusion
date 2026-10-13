import Link from "next/link";
import type { ReactNode } from "react";
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${study.project_id}`} className="text-sm text-muted hover:underline print:hidden">
            ← {projectName ?? "Proyecto"}
          </Link>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{study.name}</h1>
          <p className="mt-1 text-xs uppercase text-muted">
            {getTool(study.tool_type)?.name ?? study.tool_type}
            {subtitle ? <> · {subtitle}</> : null}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      </div>
      <StudyTabs id={study.id} active={active} variant={variant} />
    </div>
  );
}
