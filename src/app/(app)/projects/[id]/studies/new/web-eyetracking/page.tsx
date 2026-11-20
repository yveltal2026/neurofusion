import { notFound } from "next/navigation";
import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewWebEyetrackingStudyForm } from "@/tools/web-eyetracking/ui/new-study-form";

export const metadata = { title: "Nuevo Eyetracking para Web" };

export default async function NewWebEyetrackingStudyPage({
  params,
}: PageProps<"/projects/[id]/studies/new/web-eyetracking">) {
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
      <div>
        <Breadcrumbs
          items={newStudyCrumbs(id, project.name, "Eyetracking para Web")}
        />
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Nuevo Eyetracking para Web
        </h1>
        <p className="mt-1 text-sm text-muted">
          Evalúa recorridos reales en un sitio web con snippet en el{" "}
          <code>&lt;head&gt;</code> o mediante capturas web sin código.
        </p>
      </div>
      <Card>
        <NewWebEyetrackingStudyForm projectId={project.id} />
      </Card>
    </div>
  );
}
