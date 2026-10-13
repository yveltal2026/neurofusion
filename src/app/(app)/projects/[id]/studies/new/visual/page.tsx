import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewVisualStudyForm } from "@/tools/visual/ui/new-study-form";

export const metadata = { title: "Nuevo análisis visual · NeuroFusion" };

export default async function NewVisualStudyPage({ params }: PageProps<"/projects/[id]/studies/new/visual">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}/studies/new`} className="text-sm text-muted hover:underline">
          ← Elegir herramienta
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo análisis visual con IA</h1>
        <p className="mt-1 text-sm text-muted">Evalúa piezas gráficas o el recorrido de compra de uno o varios sitios.</p>
      </div>
      <Card>
        <NewVisualStudyForm projectId={project.id} />
      </Card>
    </div>
  );
}
