import Link from "next/link";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import type { StudyRow } from "@/lib/db/types";
import {
  computeSurveyAggregates,
  surveyConfigSchema,
} from "@/tools/survey/engine";
import { loadSurveyRecords } from "@/tools/survey/results/load";
import { SurveyResultsView } from "@/tools/survey/ui/results-view";

export const metadata = { title: "Resultados · NeuroFusion" };

export default async function SurveyResponsesPage({
  params,
}: PageProps<"/studies/[id]/responses">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: study } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .eq("tool_type", "survey")
    .maybeSingle<StudyRow>();
  if (!study) notFound();
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", study.project_id)
    .maybeSingle();
  const config = surveyConfigSchema.safeParse(study.config);

  const records = config.success ? await loadSurveyRecords(supabase, id) : [];
  const aggregates = config.success
    ? computeSurveyAggregates(config.data, records)
    : null;

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={project?.name}
        active="responses"
        variant="survey"
        actions={
          <Link
            href={`/api/studies/${id}/export/survey_responses`}
            prefetch={false}
            className={buttonClass("secondary")}
          >
            Descargar CSV
          </Link>
        }
      />
      {config.success && aggregates ? (
        <SurveyResultsView config={config.data} aggregates={aggregates} />
      ) : (
        <Alert tone="warning">
          La configuración guardada de este estudio no es válida.
        </Alert>
      )}
    </div>
  );
}
