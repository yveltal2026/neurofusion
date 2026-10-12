import "server-only";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAiProvider } from "./openai";
import { AiError, type AnalysisProvider } from "./types";

export { AiError } from "./types";
export type { AnalysisProvider } from "./types";
export { generateStructured } from "./structured";

/** Elige el proveedor según AI_PROVIDER (anthropic por defecto). */
export function getAnalysisProvider(env: Record<string, string | undefined> = process.env): AnalysisProvider {
  const which = (env.AI_PROVIDER || "anthropic").toLowerCase();
  if (which === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new AiError("Falta configurar ANTHROPIC_API_KEY en el servidor.", "config");
    return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }
  if (which === "openai") {
    if (!env.OPENAI_API_KEY) throw new AiError("Falta configurar OPENAI_API_KEY en el servidor.", "config");
    if (!env.OPENAI_MODEL) throw new AiError("Falta configurar OPENAI_MODEL en el servidor.", "config");
    return createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
  }
  throw new AiError(`AI_PROVIDER inválido: «${which}». Usa «anthropic» u «openai».`, "config");
}

/** ¿Hay un proveedor de IA configurado? (para ofrecer o no las funciones asistidas) */
export function isAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    getAnalysisProvider(env);
    return true;
  } catch {
    return false;
  }
}
