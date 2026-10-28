import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { VariantBuilder } from "@/tools/variants/wizard/VariantBuilder";

export const metadata = { title: "Nueva variante del IAT · NeuroFusion" };

export default async function NewVariantStudyPage({ params }: PageProps<"/projects/[id]/studies/new/variants">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs items={newStudyCrumbs(id, project.name, "Variante del IAT")} />
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva variante del IAT</h1>
      <VariantBuilder projectId={project.id} projectName={project.name} />
    </div>
  );
}
