import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { SurveyBuilder } from "@/tools/survey/builder/SurveyBuilder";

export const metadata = { title: "Nueva encuesta · NeuroFusion" };

export default async function NewSurveyStudyPage({
  params,
}: PageProps<"/projects/[id]/studies/new/survey">) {
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
      <h1 className="text-2xl font-semibold tracking-tight">Nueva encuesta</h1>
      <SurveyBuilder projectId={project.id} projectName={project.name} />
    </div>
  );
}
