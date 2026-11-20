import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { TOOLS } from "@/tools/registry";

export const metadata = { title: "Nuevo estudio · NeuroFusion" };

export default async function NewStudyPage({ params }: PageProps<"/projects/[id]/studies/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:underline">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo estudio</h1>
        <p className="mt-1 text-sm text-muted">Elige la herramienta que quieres aplicar en este proyecto.</p>
      </div>
      <ul className={`grid gap-3 ${TOOLS.length > 1 ? "sm:grid-cols-2" : "max-w-2xl"}`}>
        {TOOLS.map((tool) => (
          <li key={tool.type}>
            <Link
              href={tool.newStudyPath(id)}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Card className="h-full space-y-3 transition hover:border-primary">
                <div>
                  <h2 className="font-medium">{tool.name}</h2>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                </div>
                <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted">
                  <div>
                    <dt className="inline">Duración: </dt>
                    <dd className="inline font-medium text-foreground">{tool.duration}</dd>
                  </div>
                  <div>
                    <dt className="inline">Métrica: </dt>
                    <dd className="inline font-medium text-foreground">{tool.metric}</dd>
                  </div>
                  <div>
                    <dt className="inline">Dispositivo: </dt>
                    <dd className="inline font-medium text-foreground">{tool.requirement}</dd>
                  </div>
                </dl>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
