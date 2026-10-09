"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiError, generateStructured, getAnalysisProvider } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { loadStudyForResearcher } from "@/lib/studies";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/tools/iat/analysis/prompt";
import { analysisResultSchema } from "@/tools/iat/analysis/schema";
import { buildWarnings } from "@/tools/iat/analysis/warnings";
import { computeStudyAggregates } from "@/tools/iat/engine";
import { loadSessionViews } from "@/tools/iat/results/load";
import { toStatsSessions } from "@/tools/iat/results/views";

export interface AnalysisState {
  error?: string;
  ok?: boolean;
}

const MIN_PARTICIPANTS = 3;
const MAX_PER_HOUR = 10;

const inputSchema = z.object({ studyId: z.string().uuid(), includeInvalid: z.enum(["0", "1"]) });

/** Calcula los agregados, pide a la IA la redacción de conclusiones y guarda el resultado. */
export async function runAnalysis(_prev: AnalysisState, formData: FormData): Promise<AnalysisState> {
  const input = inputSchema.safeParse({
    studyId: formData.get("studyId"),
    includeInvalid: formData.get("includeInvalid") ?? "0",
  });
  if (!input.success) return { error: "Solicitud inválida" };
  const { studyId } = input.data;
  const includeInvalid = input.data.includeInvalid === "1";

  const { supabase } = await requireUser();
  const { config } = await loadStudyForResearcher(supabase, studyId);
  const views = await loadSessionViews(supabase, studyId, config);
  const aggregates = computeStudyAggregates(toStatsSessions(config, views), {
    dimensionLabels: config.dimensions.map((d) => d.name),
    includeInvalid,
  });
  if (aggregates.nWithUsableData < MIN_PARTICIPANTS) {
    return { error: `Se necesitan al menos ${MIN_PARTICIPANTS} participantes con datos utilizables para analizar (hay ${aggregates.nWithUsableData}).` };
  }

  // Control de costo: tope de análisis por estudio y hora.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("study_id", studyId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return { error: "Alcanzaste el límite de análisis por hora para este estudio. Inténtalo más tarde." };

  const completed = views.filter((v) => v.status === "completed");
  const warnings = buildWarnings(aggregates, {
    completed: completed.length,
    invalidCompleted: completed.filter((v) => v.allValid === false).length,
    duplicatesFlagged: views.filter((v) => v.duplicate_flag).length,
  });

  try {
    const provider = getAnalysisProvider();
    const { data, model } = await generateStructured({
      provider,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(config, aggregates, warnings),
      schema: analysisResultSchema,
    });
    const { error } = await supabase.from("analyses").insert({
      study_id: studyId,
      n_sessions: aggregates.nWithUsableData,
      include_invalid: includeInvalid,
      provider: provider.name,
      model,
      aggregates,
      result: data,
    });
    if (error) return { error: "El análisis se generó pero no se pudo guardar. Inténtalo de nuevo." };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    return { error: "No se pudo completar el análisis. Inténtalo de nuevo." };
  }

  revalidatePath(`/studies/${studyId}/analysis`);
  return { ok: true };
}
