import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { loadStudyOptions } from "@/lib/batteries";
import { BatteryBuilder } from "@/tools/battery/builder/BatteryBuilder";

export const metadata = { title: "Nueva batería · NeuroFusion" };

export default async function NewBatteryPage({ params }: PageProps<"/projects/[id]/batteries/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();
  const studies = await loadStudyOptions(supabase, id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="inline-block py-1 text-sm text-muted hover:underline">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva batería</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Una batería encadena varios estudios del proyecto (por ejemplo un IAT y una encuesta) en una sola liga, con un solo consentimiento.
          Así puedes cruzar lo implícito con lo que la gente dice, de las mismas personas.
        </p>
      </div>
      {studies.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Primero crea los estudios que formarán la batería"
          action={
            <Link href={`/projects/${id}/studies/new`} className={buttonClass("primary")}>
              Crear un estudio
            </Link>
          }
        >
          Una batería usa estudios del proyecto (IAT o encuesta). Créalos primero y vuelve aquí para ordenarlos.
        </EmptyState>
      ) : (
        <BatteryBuilder projectId={project.id} projectName={project.name} studies={studies} />
      )}
    </div>
  );
}
