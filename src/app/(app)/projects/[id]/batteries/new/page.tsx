import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { loadAvailableStudies } from "@/tools/battery/load";
import { BatteryBuilder } from "@/tools/battery/ui/BatteryBuilder";

export const metadata = { title: "Nueva batería · NeuroFusion" };

export default async function NewBatteryPage({
  params,
}: PageProps<"/projects/[id]/batteries/new">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const available = await loadAvailableStudies(supabase, project.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nueva batería</h1>
      {available.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-sm">
            Una batería une estudios que ya existen en el proyecto (IAT y
            encuestas), pero «{project.name}» todavía no tiene ninguno.
          </p>
          <Link
            href={`/projects/${project.id}/studies/new`}
            className="inline-block text-sm font-medium text-heading underline underline-offset-4"
          >
            Crear un estudio primero
          </Link>
        </Card>
      ) : (
        <BatteryBuilder
          projectId={project.id}
          projectName={project.name}
          available={available}
        />
      )}
    </div>
  );
}
