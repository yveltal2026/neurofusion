import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewSeoStudyForm } from "@/tools/seo/ui/forms";

export const metadata = { title: "Nueva auditoría SEO · NeuroFusion" };

export default async function NewSeoStudyPage({ params }: PageProps<"/projects/[id]/studies/new/seo">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={newStudyCrumbs(id, project.name, "Auditoría SEO")} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva auditoría SEO</h1>
        <p className="mt-1 text-sm text-muted">
          Define el sitio una vez y audítalo cuantas veces quieras para seguir su evolución.
        </p>
      </div>
      <Card>
        <NewSeoStudyForm projectId={project.id} />
      </Card>
    </div>
  );
}
