import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewVisualStudyForm } from "@/tools/visual/ui/new-study-form";

export const metadata = { title: "Nuevo análisis visual · NeuroFusion" };

export default async function NewVisualStudyPage({ params, searchParams }: PageProps<"/projects/[id]/studies/new/visual">) {
  const { id } = await params;
  if ((await searchParams).mode === "eyetracking") redirect(`/projects/${id}/studies/new/eyetracking`);
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={newStudyCrumbs(id, project.name, "Análisis visual")} />
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Nuevo análisis visual con IA</h1>
        <p className="mt-1 text-sm text-muted">Evalúa piezas gráficas o el recorrido de compra de uno o varios sitios.</p>
      </div>
      <Card>
        <NewVisualStudyForm projectId={project.id} />
      </Card>
    </div>
  );
}
