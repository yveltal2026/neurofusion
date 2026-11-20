import Link from "next/link";
import { notFound } from "next/navigation";
import { StudySettingsForm } from "@/components/study-settings-form";
import { StudyTabs } from "@/components/study-tabs";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { requireUser } from "@/lib/auth/session";
import type { StudyRow } from "@/lib/db/types";
import { getTool } from "@/tools/registry";
import { deleteStudy, regenerateLink } from "../actions";

const STATUS_LABEL = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;

export const metadata = { title: "Ajustes del estudio · NeuroFusion" };

export default async function StudySettingsPage({
  params,
  searchParams,
}: PageProps<"/studies/[id]/settings">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const { data: study } = await supabase.from("studies").select("*").eq("id", id).maybeSingle<StudyRow>();
  if (!study) notFound();

  const [{ data: project }, { count: responseCount }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", study.project_id).maybeSingle(),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("study_id", study.id)
      .eq("status", "completed"),
  ]);

  const toolName = getTool(study.tool_type)?.name ?? study.tool_type;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${study.project_id}`} className="text-sm text-muted hover:underline">
            ← {project?.name ?? "Proyecto"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{study.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {toolName} · {STATUS_LABEL[study.status]}
          </p>
        </div>
      </div>

      <StudyTabs id={id} active="settings" />

      {sp.regenerated === "1" ? (
        <Alert>Liga mágica regenerada. La liga anterior dejó de funcionar; comparte la nueva desde Resumen.</Alert>
      ) : null}

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Recolección y acceso</h2>
          <p className="mt-0.5 text-sm text-muted">
            Controla cuándo acepta respuestas la liga mágica y cómo se previenen participaciones repetidas.
          </p>
        </div>
        <StudySettingsForm
          id={study.id}
          status={study.status}
          maxResponses={study.max_responses}
          closesAt={study.closes_at}
          duplicatePolicy={study.duplicate_policy}
          currentResponses={responseCount ?? 0}
        />
      </Card>

      <Card className="space-y-4 border-red-500/30">
        <div>
          <h2 className="font-medium text-red-600 dark:text-red-400">Zona de riesgo</h2>
          <p className="mt-0.5 text-sm text-muted">
            Estas acciones son irreversibles y afectan de inmediato a los participantes o a los datos recolectados.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ConfirmAction
            action={regenerateLink}
            hiddenFields={{ id: study.id }}
            triggerLabel="Regenerar liga"
            triggerVariant="secondary"
            title="¿Regenerar la liga mágica?"
            description="La liga actual dejará de funcionar de inmediato. Quienes intenten abrirla verán un error y tendrás que compartir la nueva liga."
            confirmLabel="Sí, regenerar liga"
            pendingLabel="Regenerando…"
            confirmVariant="primary"
          />
          <ConfirmAction
            action={deleteStudy}
            hiddenFields={{ id: study.id }}
            triggerLabel="Eliminar estudio"
            triggerVariant="danger"
            title="¿Eliminar estudio y todos sus datos?"
            description={`Se eliminarán permanentemente ${responseCount ?? 0} sesiones completadas, sus ensayos y análisis asociados. Esta acción no se puede deshacer.`}
            confirmLabel="Eliminar estudio"
            pendingLabel="Eliminando…"
            confirmVariant="danger"
            requireText={study.name}
          />
        </div>
      </Card>
    </div>
  );
}
