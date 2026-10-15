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
import { variantConfigSchema } from "@/tools/variants/config";
import { computeVariantAggregates } from "@/tools/variants/results/aggregate";
import { loadVariantRecords } from "@/tools/variants/results/load";
import { VariantResultsView } from "@/tools/variants/ui/results-view";

export const metadata = { title: "Resultados · NeuroFusion" };

export default async function ResponsesPage({
  params,
}: PageProps<"/studies/[id]/responses">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: study } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .in("tool_type", ["survey", "iat_variant"])
    .maybeSingle<StudyRow>();
  if (!study) notFound();
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", study.project_id)
    .maybeSingle();

  const isVariant = study.tool_type === "iat_variant";
  const invalid = (
    <Alert tone="warning">
      La configuración guardada de este estudio no es válida.
    </Alert>
  );

  let body = invalid;
  if (isVariant) {
    const config = variantConfigSchema.safeParse(study.config);
    if (config.success) {
      const records = await loadVariantRecords(supabase, id);
      body = (
        <VariantResultsView
          config={config.data}
          aggregates={computeVariantAggregates(config.data, records)}
        />
      );
    }
  } else {
    const config = surveyConfigSchema.safeParse(study.config);
    if (config.success) {
      const records = await loadSurveyRecords(supabase, id);
      body = (
        <SurveyResultsView
          config={config.data}
          aggregates={computeSurveyAggregates(config.data, records)}
        />
      );
    }
  }

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={project?.name}
        active="responses"
        variant={isVariant ? "variant" : "survey"}
        actions={
          <Link
            href={`/api/studies/${id}/export/${isVariant ? "variant_results" : "survey_responses"}`}
            prefetch={false}
            className={buttonClass("secondary")}
          >
            Descargar CSV
          </Link>
        }
      />
      {body}
    </div>
  );
}
