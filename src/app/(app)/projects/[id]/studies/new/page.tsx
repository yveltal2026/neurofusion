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
        <p className="mt-1 text-sm text-muted">
          Elige entre aplicar <strong>una sola herramienta</strong> o combinar varias en una <strong>batería</strong> con una sola liga.
        </p>
      </div>
      <h2 className="text-lg font-semibold">Una herramienta</h2>
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
      <h2 className="text-lg font-semibold">Varias herramientas en una sola liga</h2>
      <Link href={`/projects/${id}/batteries/new`} className="block">
        <Card className="transition hover:border-primary">
          <h3 className="font-medium">Batería de pasos</h3>
          <p className="mt-1 text-sm text-muted">
            Une estudios del proyecto (IAT y encuestas) en una sola liga: el participante da un consentimiento y los recorre en el orden que elijas. La plataforma
            sugiere un orden y tú puedes cambiarlo u omitir pasos.
          </p>
        </Card>
      </Link>
    </div>
  );
}
