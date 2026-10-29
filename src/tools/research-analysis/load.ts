import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyRow } from "@/lib/db/types";
import {
  surveyConfigSchema,
  computeSurveyAggregates,
} from "@/tools/survey/engine";
import { loadSurveyRecords } from "@/tools/survey/results/load";
import { visualConfigSchema } from "@/tools/visual/config";
import { loadBatteryReportInput } from "@/tools/battery/report/load";
import { buildBatteryReport } from "@/tools/battery/report/report";
import { loadEyeAggregates } from "./eye-load";
import { batteryAiAggregates } from "./privacy";

export async function loadStudyAnalysis(supabase: SupabaseClient, id: string) {
  const { data: study, error } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .maybeSingle<StudyRow>();
  if (error) throw new Error("No se pudo consultar el estudio");
  if (!study) return null;
  if (study.tool_type === "survey") {
    const config = surveyConfigSchema.safeParse(study.config);
    if (!config.success) throw new Error("Configuración de encuesta inválida");
    const aggregates = computeSurveyAggregates(
      config.data,
      await loadSurveyRecords(supabase, id),
    );
    return {
      study,
      variant: "survey" as const,
      n: aggregates.nIncluded,
      aggregates,
    };
  }
  const config = visualConfigSchema.safeParse(study.config);
  if (
    study.tool_type !== "visual" ||
    !config.success ||
    config.data.mode !== "pieces" ||
    !config.data.eyeTracking
  )
    return null;
  const aggregates = await loadEyeAggregates(supabase, id);
  return {
    study,
    variant: "eye" as const,
    n: aggregates.nIncluded,
    aggregates,
  };
}

export async function loadBatteryAnalysis(
  supabase: SupabaseClient,
  id: string,
) {
  const input = await loadBatteryReportInput(supabase, id);
  if (!input) return null;
  const report = buildBatteryReport(input.steps, input.participants);
  // Respect exclusions in ANY child, consistently with the integrated report.
  const included = input.participants
    .filter((p) => !p.excluded)
    .map((p) => p.id);
  const eye = await Promise.all(
    input.detail.steps
      .filter((s) => s.enabled && s.toolType === "eyetracking")
      .map(async (s) => ({
        name: s.name,
        ...(await loadEyeAggregates(supabase, s.studyId, included)),
      })),
  );
  const canAnalyze =
    report.iat.some((d) => d.n >= 3) ||
    report.variants.some((v) => v.n >= 3) ||
    report.surveys.some((s) => s.aggregates.nIncluded >= 3) ||
    eye.some((e) => e.nIncluded >= 3);
  return {
    input,
    report,
    n: report.nIncluded,
    canAnalyze,
    aggregates: {
      ...batteryAiAggregates(report),
      eye,
      unreadable: input.unreadable,
    },
  };
}
