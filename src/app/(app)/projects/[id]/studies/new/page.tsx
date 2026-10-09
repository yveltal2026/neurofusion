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
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.type}>
            <Link href={tool.newStudyPath(id)} className="block">
              <Card className="h-full transition hover:border-primary">
                <h2 className="font-medium">{tool.name}</h2>
                <p className="mt-1 text-sm text-muted">{tool.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
