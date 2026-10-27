import { createAnthropicProvider } from "./anthropic";
import type { Tier } from "./cascade";
import { createGeminiProvider } from "./gemini";
import { createOpenAiProvider } from "./openai";
import { AiError } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Orden por defecto de la cascada (se reemplaza con AI_CASCADE), de menor a mayor costo:
 * gratuita potente → gratuita menos potente → Claude Haiku (el de paga más barato) → Gemini de
 * paga barato → Claude Sonnet → Gemini de paga más caro → Claude (último recurso; su modelo se
 * fija con ANTHROPIC_MODEL, por defecto Opus). Un fallo del proveedor pasa al siguiente nivel.
 * Modelos vigentes a oct-2026 (Gemini 2.5 ya no se entrega a proyectos nuevos y los Pro salieron
 * del nivel gratuito). Los nombres cambian: confírmalos con models.list y ajusta AI_CASCADE.
 * "free" y "paid" son dos API keys distintas de Gemini: la gratuita es la de un proyecto de
 * Google sin facturación y la de paga la de un proyecto con facturación activa.
 */
export const DEFAULT_CASCADE = [
  "gemini-free:gemini-3.8-flash",
  "gemini-free:gemini-3.5-flash-lite",
  "anthropic:claude-haiku-5-5",
  "gemini-paid:gemini-3.8-flash",
  "anthropic:claude-sonnet-5-5",
  "gemini-paid:gemini-4-argon",
  "anthropic",
].join(",");

export function geminiKeys(env: Env): { free: string | undefined; paid: string | undefined } {
  return {
    free: env.GEMINI_API_KEY_FREE || env.GEMINI_API_KEY || undefined,
    paid: env.GEMINI_API_KEY_PAID || undefined,
  };
}

interface Entry {
  id: string;
  label: string;
  build: (isLast: boolean) => Tier["provider"];
}

function parseSpec(spec: string, env: Env): Entry | null {
  const [kindRaw, ...rest] = spec.split(":");
  const kind = kindRaw.trim().toLowerCase();
  const model = rest.join(":").trim();
  const keys = geminiKeys(env);

  switch (kind) {
    case "gemini-free":
    case "gemini-paid": {
      if (!model) throw new AiError(`AI_CASCADE: «${spec}» necesita un modelo, p. ej. «${kind}:gemini-3.8-flash».`, "config");
      const tier = kind === "gemini-free" ? "free" : "paid";
      const apiKey = keys[tier];
      if (!apiKey) return null;
      return { id: `${kind}:${model}`, label: `Gemini ${tier === "free" ? "gratuito" : "de paga"} (${model})`, build: () => createGeminiProvider({ apiKey, model, tier }) };
    }
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      const chosen = model || env.ANTHROPIC_MODEL || undefined;
      return {
        id: `anthropic:${chosen ?? "default"}`,
        label: `Claude${chosen ? ` (${chosen})` : ""}`,
        build: (isLast) => createAnthropicProvider({ apiKey, model: chosen, maxRetries: isLast ? undefined : 0 }),
      };
    }
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      const chosen = model || env.OPENAI_MODEL;
      if (!apiKey) return null;
      if (!chosen) throw new AiError("AI_CASCADE: «openai» necesita un modelo (en la cascada o en OPENAI_MODEL).", "config");
      return {
        id: `openai:${chosen}`,
        label: `OpenAI (${chosen})`,
        build: (isLast) => createOpenAiProvider({ apiKey, model: chosen, maxRetries: isLast ? undefined : 0 }),
      };
    }
    default:
      throw new AiError(`AI_CASCADE: nivel desconocido «${kindRaw}». Usa gemini-free, gemini-paid, anthropic u openai.`, "config");
  }
}

/** Construye los niveles de la cascada; los que no tienen API key configurada se omiten. */
export function resolveTiers(env: Env, cascade: string = env.AI_CASCADE?.trim() || DEFAULT_CASCADE): Tier[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const raw of cascade.split(",")) {
    const spec = raw.trim();
    if (!spec) continue;
    const entry = parseSpec(spec, env);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return entries.map((e, i) => ({ id: e.id, label: e.label, provider: e.build(i === entries.length - 1) }));
}
