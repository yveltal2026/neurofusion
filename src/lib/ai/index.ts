import "server-only";
import { createAnthropicProvider } from "./anthropic";
import { createCascadeProvider } from "./cascade";
import { createOpenAiProvider } from "./openai";
import { DEFAULT_CASCADE, geminiKeys, resolveTiers } from "./tiers";
import { AiError, type AnalysisProvider } from "./types";

export { AiError } from "./types";
export type { AnalysisProvider, ContentPart, ImagePart } from "./types";
export { generateStructured } from "./structured";

type Env = Record<string, string | undefined>;

/** Comportamiento anterior: un solo proveedor fijo (AI_PROVIDER). */
function getSingleProvider(env: Env): AnalysisProvider {
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

/**
 * Devuelve el proveedor de IA. Si hay API keys de Gemini o AI_CASCADE, es una CASCADA que
 * prueba en orden: Gemini gratuito (potente → menos potente) → Gemini de paga (barato →
 * más caro) → Claude, pasando al siguiente nivel cuando uno falla o se queda sin cuota.
 * Sin ellas conserva el comportamiento anterior (AI_PROVIDER, un solo proveedor).
 */
export function getAnalysisProvider(env: Env = process.env): AnalysisProvider {
  const customCascade = env.AI_CASCADE?.trim();
  const keys = geminiKeys(env);
  if (!customCascade && !keys.free && !keys.paid) return getSingleProvider(env);

  const tiers = resolveTiers(env, customCascade || DEFAULT_CASCADE);
  if (tiers.length === 0) {
    throw new AiError(
      "Ningún nivel de la cascada de IA tiene API key. Configura GEMINI_API_KEY_FREE, GEMINI_API_KEY_PAID o ANTHROPIC_API_KEY en el servidor.",
      "config",
    );
  }
  return createCascadeProvider(tiers);
}

/** ¿Hay un proveedor de IA configurado? (para ofrecer o no las funciones asistidas) */
export function isAiConfigured(env: Env = process.env): boolean {
  try {
    getAnalysisProvider(env);
    return true;
  } catch {
    return false;
  }
}
