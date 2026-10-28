import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import { isAiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { Wizard } from "@/tools/iat/wizard/Wizard";

export const metadata = { title: "Nuevo estudio IAT · NeuroFusion" };

export default async function NewIatStudyPage({ params }: PageProps<"/projects/[id]/studies/new/iat">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs items={newStudyCrumbs(id, project.name, "IAT")} />
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Nuevo estudio IAT</h1>
      <Wizard projectId={project.id} projectName={project.name} aiAvailable={isAiConfigured()} />
    </div>
  );
}
