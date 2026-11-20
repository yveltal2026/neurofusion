import { notFound } from "next/navigation";
import { Breadcrumbs, newStudyCrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewWebVisualStudyForm } from "@/tools/web-visual/ui/new-study-form";

export const metadata = { title: "Nuevo análisis de imagen web" };

export default async function NewWebVisualStudyPage({
  params,
}: PageProps<"/projects/[id]/studies/new/web-visual">) {
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
          items={newStudyCrumbs(id, project.name, "Análisis de Imagen Web")}
        />
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Nuevo análisis de Imagen Web
        </h1>
        <p className="mt-1 text-sm text-muted">
          Sube capturas de pantalla de tu sitio (desktop o móvil) para evaluar
          atención estimada, jerarquía visual, CTA y fricción UX.
        </p>
      </div>
      <Card>
        <NewWebVisualStudyForm projectId={project.id} />
      </Card>
    </div>
  );
}
