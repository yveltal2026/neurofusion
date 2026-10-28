import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import { RowLink, RowList } from "@/components/ui/rows";
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
        <Breadcrumbs items={newStudyCrumbs(id, project.name)} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo estudio</h1>
        <p className="mt-1 text-sm text-muted">
          Elige entre aplicar <strong>una sola herramienta</strong> o combinar varias en una <strong>batería</strong> con una sola liga.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Una herramienta</h2>
        <RowList>
          {TOOLS.map((tool) => (
            <RowLink key={tool.type} href={tool.newStudyPath(id)} icon={tool.icon} title={tool.name} description={tool.description} />
          ))}
        </RowList>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Varias herramientas en una sola liga</h2>
        <RowList>
          <RowLink
            href={`/projects/${id}/batteries/new`}
            icon="layers"
            title="Batería de pasos"
            description="Une estudios del proyecto (IAT, variantes del IAT, encuestas e imágenes con IA) en una sola liga: el participante da un consentimiento y los recorre en el orden que elijas. La plataforma sugiere un orden y tú puedes cambiarlo u omitir pasos."
          />
        </RowList>
      </section>
    </div>
  );
}
