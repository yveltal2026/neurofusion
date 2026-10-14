"use server";

import { AiError, getAnalysisProvider } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { briefSchema, suggestDesign, suggestionToConfigPatch, type ConfigPatch } from "./ai-suggest";

export type SuggestDesignResult = { ok: true; patch: ConfigPatch; notes: string } | { ok: false; error: string };

const MAX_PER_HOUR = 15;

/**
 * Propone producto, dimensiones y palabras a partir de una descripción corta.
 * Sólo se envía a la IA ese texto (nada de datos de participantes).
 */
export async function suggestIatDesign(raw: unknown): Promise<SuggestDesignResult> {
  const brief = briefSchema.safeParse(raw);
  if (!brief.success) return { ok: false, error: brief.error.issues[0]?.message ?? "Descripción inválida" };

  const { user } = await requireUser();
  const limited = rateLimit(`ai-suggest:${user.id}`, MAX_PER_HOUR, 60 * 60_000);
  if (!limited.ok) return { ok: false, error: "Alcanzaste el límite de sugerencias por hora. Inténtalo más tarde o captura los datos manualmente." };

  try {
    const { suggestion } = await suggestDesign(getAnalysisProvider(), brief.data);
    return { ok: true, patch: suggestionToConfigPatch(suggestion), notes: suggestion.notes };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo generar la sugerencia. Inténtalo de nuevo o captura los datos manualmente." };
  }
}
