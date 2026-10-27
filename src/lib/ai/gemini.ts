import { AiError, safeDetail, type AnalysisProvider, type ChatMessage, type CompletionRequest, type CompletionResult } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Traduce los mensajes neutros al formato de Gemini (rol "model", imágenes como inlineData). */
export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m): GeminiContent => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") return { role, parts: [{ text: m.content }] };
    return {
      role,
      parts: m.content.flatMap((p): GeminiPart[] => {
        if (p.type === "text") return [{ text: p.text }];
        // El asistente sólo devuelve texto; una imagen ahí no tiene sentido.
        return role === "user" ? [{ inlineData: { mimeType: p.mediaType, data: p.data } }] : [];
      }),
    };
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: (GeminiPart & { thought?: boolean })[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

interface GeminiErrorBody {
  error?: { code?: number; status?: string; message?: string };
}

const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/** Convierte una respuesta HTTP de error de Gemini en un AiError con mensaje apto para el investigador. */
function toHttpError(status: number, body: GeminiErrorBody | null, label: string): AiError {
  const apiStatus = body?.error?.status ?? "";
  const message = body?.error?.message ?? "";
  const detail = safeDetail(`HTTP ${status}${apiStatus ? ` ${apiStatus}` : ""}${message ? `: ${message}` : ""}`);
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return new AiError(`${label} agotó su cuota o limitó las solicitudes.`, "rate_limit", detail);
  }
  if (status === 401 || status === 403 || apiStatus === "UNAUTHENTICATED" || apiStatus === "PERMISSION_DENIED" || /api key not valid/i.test(message)) {
    return new AiError(`La API key de ${label} no es válida o no tiene acceso al modelo.`, "auth", detail);
  }
  return new AiError(`Error del proveedor de IA (${label}, ${status}).`, "provider", detail);
}

/**
 * Gemini por REST (sin SDK). "free" y "paid" sólo distinguen la etiqueta: lo que determina el
 * nivel de uso es la API key (proyecto de Google sin facturación vs. con facturación).
 */
export function createGeminiProvider(opts: {
  apiKey: string;
  model: string;
  tier: "free" | "paid";
  fetchImpl?: typeof fetch;
}): AnalysisProvider {
  const label = `Gemini ${opts.tier === "free" ? "gratuito" : "de paga"}`;
  const model = opts.model.replace(/^models\//, "");
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "gemini",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      let res: Response;
      try {
        res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: toGeminiContents(req.messages),
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 16000 },
          }),
          signal: req.signal,
        });
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        const name = e instanceof Error ? e.name : "Error";
        throw new AiError(timedOut ? `${label} tardó demasiado en responder.` : `No se pudo conectar con ${label}.`, "provider", safeDetail(`${name}: ${e instanceof Error ? e.message : String(e)}`));
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as GeminiErrorBody | null;
        throw toHttpError(res.status, body, label);
      }

      const json = (await res.json().catch(() => null)) as GeminiResponse | null;
      if (!json) throw new AiError(`${label} devolvió una respuesta ilegible.`, "provider", "HTTP 200 con cuerpo que no es JSON");
      if (json.promptFeedback?.blockReason) {
        throw new AiError("El modelo rechazó la solicitud. Revisa el contenido del estudio e inténtalo de nuevo.", "refusal");
      }
      const candidate = json.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new AiError("La respuesta de la IA quedó incompleta. Inténtalo de nuevo.", "truncated");
      }
      if (candidate?.finishReason && BLOCKED_FINISH.has(candidate.finishReason)) {
        throw new AiError("El modelo rechazó la solicitud. Revisa el contenido del estudio e inténtalo de nuevo.", "refusal");
      }
      // Los modelos con razonamiento pueden devolver partes "thought": no son parte de la respuesta.
      const text = (candidate?.content?.parts ?? []).flatMap((p) => (p.text && !p.thought ? [p.text] : [])).join("");
      if (!text) throw new AiError(`${label} devolvió una respuesta vacía.`, "provider", `sin texto; finishReason=${candidate?.finishReason ?? "ninguno"}`);
      return { text, model: json.modelVersion ?? model };
    },
  };
}
