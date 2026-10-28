import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewEyeTrackingStudyForm } from "@/tools/eyetracking/ui/new-study-form";

export const metadata = { title: "Nuevo estudio de eye tracking · NeuroFusion" };

export default async function NewEyeTrackingStudyPage({ params }: PageProps<"/projects/[id]/studies/new/eyetracking">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={newStudyCrumbs(id, project.name, "Eye tracking")} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo estudio de eye tracking</h1>
        <p className="mt-1 text-sm text-muted">Mide dónde miran tus participantes mientras observan tus imágenes con webcam.</p>
      </div>
      <Card><NewEyeTrackingStudyForm projectId={project.id} /></Card>
    </div>
  );
}
