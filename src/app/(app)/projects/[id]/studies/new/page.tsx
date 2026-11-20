import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandIllustration } from "@/components/brand/illustration";
import { Icon } from "@/components/brand/icon";
import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { buttonClass } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/ui/evidence-badge";
import { requireUser } from "@/lib/auth/session";
import { TOOL_CATEGORIES, TOOLS, type ToolType } from "@/tools/registry";

export const metadata = { title: "Nuevo estudio" };

const ILLUSTRATIONS = {
  eyetracking: "ocular", visual: "atencion", web_visual: "atencion", web_eyetracking: "ocular", iat: "asociacion",
  iat_variant: "variantes", survey: "encuesta", seo: "seo",
} as const satisfies Record<ToolType, string>;

export default async function NewStudyPage({ params }: PageProps<"/projects/[id]/studies/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Breadcrumbs items={newStudyCrumbs(id, project.name)} />
        <h1 className="page-title">¿Qué quieres saber?</h1>
        <p className="text-muted">Elige la herramienta para tu nuevo estudio.</p>
      </div>

      <div className="bg-profundo flex flex-wrap items-center justify-between gap-4 rounded-panel p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandIllustration name="mod-baterias" tone="deep" className="hidden w-20 shrink-0 sm:block" />
          <div>
            <h2 className="text-lg font-bold">Crear una batería</h2>
            <p className="text-sm text-muted">Combina varias herramientas en una liga con un solo consentimiento.</p>
          </div>
        </div>
        <Link href={`/projects/${id}/batteries/new`} className={buttonClass()}>
          Armar batería <Icon name="arrow" className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {TOOL_CATEGORIES.map((category) => {
          const tools = TOOLS.filter((tool) => tool.category === category.id)
            .sort((a, b) => Number(b.type === "eyetracking") - Number(a.type === "eyetracking"));
          return (
            <section key={category.id} aria-labelledby={`category-${category.id}`} className="glass-panel min-w-0 space-y-3 rounded-panel p-4 sm:p-5">
              <div>
                <p className="text-xs font-medium text-muted">{category.name}</p>
                <h2 id={`category-${category.id}`} className="text-2xl font-extrabold">{category.question}</h2>
              </div>
              <ul className="space-y-2">
                {tools.map((tool) => (
                  <li key={tool.type}>
                    <Link
                      href={tool.newStudyPath(id)}
                      className={`group flex items-start gap-3 rounded-lg border border-border/70 bg-surface/80 p-3 hover:border-accent-ink sm:items-center ${tool.type === "visual" ? "estimated-panel" : ""}`}
                    >
                      <span className="grid size-14 shrink-0 place-items-center rounded-md bg-neuro-tint sm:size-19">
                        <BrandIllustration name={ILLUSTRATIONS[tool.type]} className="block w-full" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-bold text-heading group-hover:underline">{tool.name}</span>
                        <span className="block text-xs text-muted">{tool.description}</span>
                        {tool.type === "visual" ? <EvidenceBadge kind="estimated" /> : null}
                      </span>
                      <Icon name="arrow" className="mt-1 hidden size-5 text-muted sm:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
