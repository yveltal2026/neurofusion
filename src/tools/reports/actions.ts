"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import type { StudyRow } from "@/lib/db/types";
import { AiError, generateStructured, getAnalysisProvider } from "@/lib/ai";
import { loadReportSource, reportHash } from "./load";
import { reportEligibility } from "./model";
import { REPORT_SYSTEM_PROMPT, reportUserPrompt } from "./prompt";
import { briefReportSchema, REPORT_VERSION, type StoredReport } from "./schema";

export interface ReportActionState {
  error?: string;
  ok?: boolean;
}
const MAX_PER_HOUR = 10;

export async function generateStudyReport(
  _previous: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const id = z.string().uuid().safeParse(formData.get("studyId"));
  if (!id.success) return { error: "Solicitud inválida." };
  const { supabase } = await requireUser();
  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id.data)
    .in("tool_type", ["survey", "visual"])
    .maybeSingle<StudyRow>();
  if (studyError || !study)
    return { error: "No se encontró el estudio o no tienes acceso." };

  try {
    const source = await loadReportSource(supabase, study);
    const eligibility = reportEligibility(source.snapshot);
    if (!eligibility.ready) return { error: eligibility.reason };
    const { count, error: countError } = await supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("study_id", id.data)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    if (countError || count === null)
      return {
        error:
          "No se pudo comprobar el límite de reportes. Inténtalo de nuevo.",
      };
    if (count >= MAX_PER_HOUR)
      return {
        error:
          "Alcanzaste el límite de 10 reportes por hora para este estudio. Inténtalo más tarde.",
      };
    const provider = getAnalysisProvider();
    const userPrompt = reportUserPrompt(source.snapshot);
    if (userPrompt.length > 120_000)
      return {
        error:
          "El estudio es demasiado extenso para un reporte breve con IA. Las visualizaciones y el CSV siguen disponibles.",
      };
    const { data, model } = await generateStructured({
      provider,
      system: REPORT_SYSTEM_PROMPT,
      user: userPrompt,
      schema: briefReportSchema,
      signal: AbortSignal.timeout(100_000),
    });
    const result: StoredReport = {
      kind: "study_report",
      version: REPORT_VERSION,
      sourceKind: source.kind,
      sourceHash: reportHash(source.snapshot),
      report: data,
    };
    const { error } = await supabase.from("analyses").insert({
      study_id: id.data,
      // Los estudios visuales no tienen participantes: su cantidad de piezas queda en aggregates.
      n_sessions: source.kind === "visual" ? 0 : eligibility.units,
      include_invalid: false,
      provider: provider.name,
      model,
      aggregates: source.snapshot,
      result,
    });
    if (error)
      return {
        error:
          "El reporte se generó, pero no pudo guardarse. Inténtalo de nuevo.",
      };
  } catch (error) {
    return {
      error:
        error instanceof AiError
          ? error.message
          : "No se pudo generar el reporte. Inténtalo de nuevo; los resultados siguen disponibles.",
    };
  }
  revalidatePath(`/studies/${id.data}/report`);
  return { ok: true };
}
