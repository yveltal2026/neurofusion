import "server-only";
import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyRow } from "@/lib/db/types";
import {
  computeSurveyAggregates,
  surveyConfigSchema,
} from "@/tools/survey/engine";
import { loadSurveyRecords } from "@/tools/survey/results/load";
import { loadEyeReportRecords } from "@/tools/eyetracking/results/load";
import { visualConfigSchema } from "@/tools/visual/config";
import { loadAssets } from "@/tools/visual/results";
import {
  eyeReportSnapshot,
  surveyReportSnapshot,
  visualReportSnapshot,
  type ReportSnapshot,
} from "./model";
import {
  REPORT_VERSION,
  storedReportSchema,
  type ReportKind,
  type StoredReport,
} from "./schema";

export function reportHash(snapshot: ReportSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/** La misma fuente autoritativa alimenta pantalla y generación; siempre con RLS del investigador. */
export async function loadReportSource(
  supabase: SupabaseClient,
  study: StudyRow,
) {
  if (study.tool_type === "survey") {
    const parsed = surveyConfigSchema.safeParse(study.config);
    if (!parsed.success)
      throw new Error("La configuración guardada de la encuesta no es válida");
    const records = await loadSurveyRecords(supabase, study.id);
    const snapshot = surveyReportSnapshot(
      parsed.data.title,
      computeSurveyAggregates(parsed.data, records),
    );
    return { kind: "survey" as const, config: parsed.data, records, snapshot };
  }
  if (study.tool_type !== "visual") notFound();
  const parsed = visualConfigSchema.safeParse(study.config);
  if (!parsed.success)
    throw new Error("La configuración guardada del estudio no es válida");
  if (parsed.data.mode !== "pieces") notFound();
  const config = parsed.data;
  const assets = await loadAssets(supabase, study.id);
  if (config.eyeTracking) {
    const records = await loadEyeReportRecords(supabase, study.id);
    return {
      kind: "eye" as const,
      config,
      assets,
      snapshot: eyeReportSnapshot(
        study.name,
        config.objective,
        assets,
        records,
      ),
    };
  }
  return {
    kind: "visual" as const,
    config,
    assets,
    snapshot: visualReportSnapshot(study.name, config.objective, assets),
  };
}
export type ReportSource = Awaited<ReturnType<typeof loadReportSource>>;

export interface SavedReport {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  result: StoredReport;
}
export interface SavedReportState {
  report: SavedReport | null;
  error?: string;
}

export async function loadSavedReport(
  supabase: SupabaseClient,
  studyId: string,
  kind: ReportKind,
): Promise<SavedReportState> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, created_at, provider, model, result")
    .eq("study_id", studyId)
    .contains("result", {
      kind: "study_report",
      version: REPORT_VERSION,
      sourceKind: kind,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    return {
      report: null,
      error:
        "No se pudo cargar el reporte guardado. Actualiza la página para reintentarlo; las visualizaciones siguen disponibles.",
    };
  if (!data) return { report: null };
  const parsed = storedReportSchema.safeParse(data.result);
  if (!parsed.success)
    return {
      report: null,
      error:
        "El reporte guardado no tiene un formato válido. Puedes generar uno nuevo.",
    };
  return {
    report: {
      id: data.id,
      createdAt: data.created_at,
      provider: data.provider,
      model: data.model,
      result: parsed.data,
    },
  };
}
