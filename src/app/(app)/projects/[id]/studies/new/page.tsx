import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
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
        <Link href={`/projects/${id}`} className="inline-block py-1 text-sm text-muted hover:underline">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo estudio</h1>
        <p className="mt-1 text-sm text-muted">Elige la herramienta que quieres aplicar en este proyecto.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.type}>
            <Link href={tool.newStudyPath(id)} className="block">
              <Card className="flex h-full gap-4 transition hover:border-primary">
                <IconTile name={tool.icon} />
                <div className="min-w-0">
                  <h2 className="font-medium">{tool.name}</h2>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <div className="space-y-3 pt-2">
        <h2 className="font-medium">O combina varios estudios</h2>
        <Link href={`/projects/${id}/batteries/new`} className="block">
          <Card className="flex gap-4 transition hover:border-primary">
            <IconTile name="layers" />
            <div className="min-w-0">
              <h3 className="font-medium">Batería de estudios</h3>
              <p className="mt-1 text-sm text-muted">
                Encadena estudios del proyecto (por ejemplo un IAT y una encuesta) en una sola liga y con un solo consentimiento, para cruzar lo
                implícito con lo que la gente dice, de las mismas personas.
              </p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
