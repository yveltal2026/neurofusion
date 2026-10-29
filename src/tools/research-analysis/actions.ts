"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { AiError, generateStructured, getAnalysisProvider } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { loadStudyAnalysis, loadBatteryAnalysis } from "./load";
import {
  researchContextSchema,
  researchResultSchema,
  RESEARCH_SYSTEM,
} from "./schema";

export interface ResearchAnalysisState {
  error?: string;
  ok?: boolean;
}
const inputSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["study", "battery"]),
  context: researchContextSchema,
});

export async function runResearchAnalysis(
  _previous: ResearchAnalysisState,
  form: FormData,
): Promise<ResearchAnalysisState> {
  const parsed = inputSchema.safeParse({
    id: form.get("id"),
    kind: form.get("kind"),
    context: {
      material: form.get("material"),
      materialObjective: form.get("materialObjective"),
      brandObjective: form.get("brandObjective"),
      audience: form.get("audience") ?? "",
      question: form.get("question") ?? "",
    },
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Solicitud inválida" };
  const { id, kind, context } = parsed.data;
  const { supabase, user } = await requireUser();
  try {
    const loaded =
      kind === "study"
        ? await loadStudyAnalysis(supabase, id)
        : await loadBatteryAnalysis(supabase, id);
    if (!loaded) return { error: "No se encontró el estudio o la batería" };
    if (loaded.n < 3)
      return {
        error: `Se necesitan al menos 3 participantes incluidos (hay ${loaded.n}).`,
      };
    if ("canAnalyze" in loaded && !loaded.canAnalyze)
      return {
        error:
          "Se necesitan al menos 3 participantes con datos utilizables en una medida de la batería. Revisa la calidad y las exclusiones.",
      };
    if (
      !rateLimit(`research-analysis:${user.id}:${kind}:${id}`, 10, 60 * 60_000)
        .ok
    )
      return {
        error:
          "Alcanzaste el límite de análisis por hora. Inténtalo más tarde.",
      };
    const column = kind === "study" ? "study_id" : "battery_id";
    const { count, error: countError } = await supabase
      .from("research_analyses")
      .select("id", { count: "exact", head: true })
      .eq(column, id)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    if (countError)
      return {
        error:
          "No se pudo consultar el historial de análisis. Inténtalo más tarde.",
      };
    if ((count ?? 0) >= 10)
      return {
        error:
          "Alcanzaste el límite de análisis por hora. Inténtalo más tarde.",
      };
    const provider = getAnalysisProvider();
    const { data, model } = await generateStructured({
      provider,
      system: RESEARCH_SYSTEM,
      user: JSON.stringify({ context, aggregates: loaded.aggregates }),
      schema: researchResultSchema,
    });
    const { error } = await supabase
      .from("research_analyses")
      .insert({
        [column]: id,
        context,
        aggregates: loaded.aggregates,
        result: data,
        provider: provider.name,
        model,
        n_sessions: loaded.n,
      });
    if (error)
      return {
        error:
          "El análisis se generó pero no se pudo guardar. Inténtalo de nuevo.",
      };
    revalidatePath(
      `/${kind === "study" ? "studies" : "batteries"}/${id}/analysis`,
    );
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof AiError
          ? error.message
          : "No se pudo completar el análisis. Inténtalo de nuevo.",
    };
  }
}
