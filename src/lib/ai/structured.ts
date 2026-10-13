import type { z } from "zod";
import { AiError, type AnalysisProvider, type ChatMessage, type ContentPart } from "./types";

/** Extrae un objeto JSON de una respuesta de texto (admite cercas ```json y texto alrededor). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Último recurso: del primer "{" al último "}".
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError("La respuesta no contiene JSON");
  }
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  /** 1 si salió bien a la primera, 2 si hizo falta el reintento de corrección. */
  attempts: number;
}

/**
 * Pide una respuesta JSON y la valida con Zod. Si no cumple el esquema, reintenta UNA
 * vez mostrándole al modelo qué falló. Si vuelve a fallar, lanza AiError("invalid_output").
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  provider: AnalysisProvider;
  system: string;
  /** Texto, o texto + imágenes para análisis visual. */
  user: string | ContentPart[];
  schema: S;
}): Promise<StructuredResult<z.infer<S>>> {
  const messages: ChatMessage[] = [{ role: "user", content: opts.user }];
  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await opts.provider.complete({ system: opts.system, messages });
    try {
      const parsed = opts.schema.safeParse(extractJson(res.text));
      if (parsed.success) return { data: parsed.data, model: res.model, attempts: attempt };
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    } catch (e) {
      lastProblem = e instanceof Error ? e.message : "JSON inválido";
    }
    messages.push(
      { role: "assistant", content: res.text },
      {
        role: "user",
        content: `Tu respuesta no cumplió el formato requerido (${lastProblem}). Responde de nuevo SOLO con el objeto JSON válido, sin texto adicional.`,
      },
    );
  }
  throw new AiError(`La IA no devolvió un análisis con el formato esperado (${lastProblem}). Inténtalo de nuevo.`, "invalid_output");
}
