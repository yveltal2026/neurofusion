import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { requireUser } from "@/lib/auth/session";
import { TOOL_CATEGORIES, TOOLS } from "@/tools/registry";

export const metadata = { title: "Nuevo estudio · NeuroFusion" };

export default async function NewStudyPage({
  params,
}: PageProps<"/projects/[id]/studies/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="inline-block py-1 text-sm text-muted hover:underline"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Nuevo estudio
        </h1>
        <p className="mt-1 text-sm text-muted">
          Elige entre aplicar <strong>una sola herramienta</strong> o combinar
          varias en una <strong>batería</strong> con una sola liga.
        </p>
      </div>
      {TOOL_CATEGORIES.map((category) => (
        <section
          key={category.id}
          aria-labelledby={`category-${category.id}`}
          className="space-y-3"
        >
          <div>
            <h2
              id={`category-${category.id}`}
              className="text-lg font-semibold"
            >
              {category.name}
            </h2>
            <p className="mt-1 text-sm text-muted">{category.question}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TOOLS.filter((tool) => tool.category === category.id)
              .sort(
                (a, b) =>
                  Number(b.type === "eyetracking") -
                  Number(a.type === "eyetracking"),
              )
              .map((tool) => (
                <li key={tool.type}>
                  <Link
                    href={tool.newStudyPath(id)}
                    className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  >
                    <Card className="flex h-full gap-4 transition hover:border-primary">
                      <IconTile name={tool.icon} />
                      <div className="min-w-0">
                        <h3 className="font-medium">{tool.name}</h3>
                        {(tool.type === "eyetracking" ||
                          tool.type === "visual") && (
                          <p className="mt-2 inline-block rounded-full bg-neuro/15 px-2.5 py-1 text-xs font-medium text-heading">
                            {tool.type === "eyetracking"
                              ? "Medición con participantes"
                              : "Estimaciones con IA · no medidas ni validadas"}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-muted">
                          {tool.description}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section
        aria-labelledby="combine-tools"
        className="space-y-3 border-t border-border pt-6"
      >
        <div>
          <h2 id="combine-tools" className="text-lg font-semibold">
            Combinar herramientas
          </h2>
          <p className="mt-1 text-sm text-muted">
            Varias herramientas en una sola liga.
          </p>
        </div>
        <Link
          href={`/projects/${id}/batteries/new`}
          className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Card className="transition hover:border-primary">
            <h3 className="font-medium">Batería de pasos</h3>
            <p className="mt-1 text-sm text-muted">
              Une estudios del proyecto (IAT, variantes del IAT, encuestas e
              imágenes con IA) en una sola liga: el participante da un
              consentimiento y los recorre en el orden que elijas. La plataforma
              sugiere un orden y tú puedes cambiarlo u omitir pasos.
            </p>
          </Card>
        </Link>
      </section>
    </div>
  );
}
