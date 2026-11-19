import Link from "next/link";
import { Icon } from "@/components/brand/icon";
import { ActiveStudyTabs } from "@/components/active-study-tabs";
import { studyTabsVariant } from "@/components/study-tabs";
import { requireUser } from "@/lib/auth/session";
import type { ProjectRow, StudyRow } from "@/lib/db/types";

type NavigationStudy = Pick<StudyRow, "id" | "name" | "project_id" | "tool_type" | "config">;

export async function StudyNavigation({ id }: { id: string }) {
  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id, name, project_id, tool_type, config")
    .eq("id", id)
    .maybeSingle<NavigationStudy>();
  if (!study) return null;

  const [{ data: project }, { data: projectStudies }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle<Pick<ProjectRow, "name">>(),
    supabase.from("studies").select("id, name").eq("project_id", study.project_id)
      .order("name").returns<Pick<StudyRow, "id" | "name">[]>(),
  ]);

  const alternatives = (projectStudies ?? []).filter((item) => item.id !== id);

  return (
    <section className="space-y-2 rounded-lg border border-border bg-deep-2 p-2">
      <Link
        href={`/projects/${study.project_id}`}
        className="workspace-nav-link px-2"
      >
        <Icon name="folder" className="size-5" />
        <span className="min-w-0 break-words">{project?.name ?? "Volver al proyecto"}</span>
      </Link>
      {alternatives.length ? (
        <details key={id} className="rounded-md bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 break-words">{study.name}<span className="sr-only">, cambiar de estudio</span></span>
            <span aria-hidden="true" className="size-2 shrink-0 -translate-y-0.5 rotate-45 border-r border-b border-current" />
          </summary>
          <ul className="max-h-52 overflow-y-auto border-t border-border p-1">
            {alternatives.map((item) => (
              <li key={item.id}>
                <Link href={`/studies/${item.id}`} className="workspace-nav-link break-words" prefetch={false}>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="px-2 py-1 text-xs font-semibold break-words text-on-deep-muted">{study.name}</p>
      )}
      <ActiveStudyTabs id={id} variant={studyTabsVariant(study)} />
    </section>
  );
}
