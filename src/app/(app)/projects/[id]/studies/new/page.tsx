import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/icon";
import { IconTile } from "@/components/ui/icon-tile";
import { requireUser } from "@/lib/auth/session";
import { TOOL_CATEGORIES, TOOLS } from "@/tools/registry";

export const metadata = { title: "Nuevo estudio · Laboratorio Digital" };

const TOOL_SUBTITLES: Record<string, string> = {
  eyetracking: "Medición con participantes",
  visual: "Estimaciones con IA · sin participantes",
  iat: "2 marcas o conceptos",
  iat_variant: "SC-IAT · Go/No-Go · Priming",
  survey: "SUS · NPS · SAM · Preguntas propias",
  seo: "Indexación · Core Web Vitals · IA",
};

function StudyCard({
  href,
  icon,
  title,
  subtitle,
  description,
}: {
  href: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col justify-between rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-md motion-reduce:hover:translate-y-0"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <IconTile
            name={icon}
            size="md"
            className="transition-transform duration-150 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon name="arrow" className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-heading transition-colors group-hover:text-primary">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-xs font-medium text-primary">
              {subtitle}
            </p>
          ) : null}
          <p className="pt-0.5 text-xs leading-relaxed text-muted">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default async function NewStudyPage({ params }: PageProps<"/projects/[id]/studies/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  const attentionTools = TOOLS.filter((t) => t.category === "attention").sort(
    (a, b) => Number(b.type === "eyetracking") - Number(a.type === "eyetracking"),
  );
  const associationTools = TOOLS.filter((t) => t.category === "association");
  const perceptionTools = TOOLS.filter((t) => t.category === "perception");
  const digitalTools = TOOLS.filter((t) => t.category === "digital");

  const attentionCategory = TOOL_CATEGORIES.find((c) => c.id === "attention");
  const associationCategory = TOOL_CATEGORIES.find((c) => c.id === "association");
  const perceptionCategory = TOOL_CATEGORIES.find((c) => c.id === "perception");
  const digitalCategory = TOOL_CATEGORIES.find((c) => c.id === "digital");

  return (
    <div className="space-y-7">
      <div>
        <Breadcrumbs items={newStudyCrumbs(id, project.name)} />
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-heading md:text-3xl">Nuevo estudio</h1>
        <p className="mt-1 text-sm text-muted">
          Elige entre aplicar <strong>una sola herramienta</strong> o combinar varias en una <strong>batería</strong> con una sola liga.
        </p>
      </div>

      {/* Atención visual */}
      <section aria-labelledby="category-attention" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
          <h2 id="category-attention" className="font-display text-base font-bold text-heading">
            {attentionCategory?.name ?? "Atención visual"}
          </h2>
          <span className="text-xs text-muted">· {attentionCategory?.question ?? "¿Qué miran?"}</span>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {attentionTools.map((tool) => (
            <StudyCard
              key={tool.type}
              href={tool.newStudyPath(id)}
              icon={tool.icon}
              title={tool.name}
              subtitle={TOOL_SUBTITLES[tool.type]}
              description={tool.description}
            />
          ))}
        </div>
      </section>

      {/* Asociaciones implícitas */}
      <section aria-labelledby="category-association" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
          <h2 id="category-association" className="font-display text-base font-bold text-heading">
            {associationCategory?.name ?? "Asociaciones implícitas"}
          </h2>
          <span className="text-xs text-muted">· {associationCategory?.question ?? "¿Qué asocian?"}</span>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {associationTools.map((tool) => (
            <StudyCard
              key={tool.type}
              href={tool.newStudyPath(id)}
              icon={tool.icon}
              title={tool.name}
              subtitle={TOOL_SUBTITLES[tool.type]}
              description={tool.description}
            />
          ))}
        </div>
      </section>

      {/* Percepción y Diagnóstico digital en 2 columnas */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section aria-labelledby="category-perception" className="space-y-3 flex flex-col justify-between">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
            <h2 id="category-perception" className="font-display text-base font-bold text-heading">
              {perceptionCategory?.name ?? "Percepción y opinión"}
            </h2>
            <span className="text-xs text-muted">· {perceptionCategory?.question ?? "¿Qué opinan?"}</span>
          </div>
          <div className="flex-1">
            {perceptionTools.map((tool) => (
              <StudyCard
                key={tool.type}
                href={tool.newStudyPath(id)}
                icon={tool.icon}
                title={tool.name}
                subtitle={TOOL_SUBTITLES[tool.type]}
                description={tool.description}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="category-digital" className="space-y-3 flex flex-col justify-between">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
            <h2 id="category-digital" className="font-display text-base font-bold text-heading">
              {digitalCategory?.name ?? "Diagnóstico digital"}
            </h2>
            <span className="text-xs text-muted">· {digitalCategory?.question ?? "¿Cómo funciona tu sitio?"}</span>
          </div>
          <div className="flex-1">
            {digitalTools.map((tool) => (
              <StudyCard
                key={tool.type}
                href={tool.newStudyPath(id)}
                icon={tool.icon}
                title={tool.name}
                subtitle={TOOL_SUBTITLES[tool.type]}
                description={tool.description}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Combinar herramientas */}
      <section aria-labelledby="combine-tools" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1.5">
          <h2 id="combine-tools" className="font-display text-base font-bold text-heading">
            Combinar herramientas
          </h2>
          <span className="text-xs text-muted">· Varias herramientas en una sola liga</span>
        </div>
        <Link
          href={`/projects/${id}/batteries/new`}
          className="group relative flex flex-col justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3.5 sm:items-center">
            <IconTile
              name="layers"
              size="md"
              className="transition-transform duration-150 group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-semibold text-heading transition-colors group-hover:text-primary">
                  Batería de pasos
                </h3>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Multi-estudio
                </span>
              </div>
              <p className="text-xs font-medium text-primary">
                Consentimiento único · Recorrido secuencial
              </p>
              <p className="max-w-2xl text-xs leading-relaxed text-muted">
                Une estudios del proyecto (IAT, variantes, encuestas y visual) en una sola liga: el participante da un consentimiento y los recorre en el orden que elijas.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary self-end sm:self-center">
            <span>Crear batería</span>
            <Icon name="arrow" className="size-4 transition-transform duration-150 group-hover:translate-x-1" />
          </div>
        </Link>
      </section>
    </div>
  );
}
