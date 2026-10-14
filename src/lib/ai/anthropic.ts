import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AnalysisProvider, type ChatMessage, type CompletionRequest, type CompletionResult } from "./types";

/** Modelo por defecto según la guía vigente de la API; sobreescribible con ANTHROPIC_MODEL. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Traduce los mensajes neutros al formato de Anthropic (bloques image con fuente base64). */
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p): Anthropic.ContentBlockParam =>
            p.type === "text"
              ? { type: "text", text: p.text }
              : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
          ),
  }));
}

export function createAnthropicProvider(opts: { apiKey: string; model?: string }): AnalysisProvider {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model || DEFAULT_ANTHROPIC_MODEL;

  return {
    name: "anthropic",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      try {
        // Sin temperature/top_p ni budget_tokens: los modelos actuales los rechazan (400).
        // El pensamiento adaptativo viene activado por defecto.
        const res = await client.messages.create({
          model,
          max_tokens: 16000,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
        });
        if (res.stop_reason === "refusal") {
          throw new AiError("El modelo rechazó la solicitud. Revisa el contenido del estudio e inténtalo de nuevo.", "refusal");
        }
        if (res.stop_reason === "max_tokens") {
          throw new AiError("La respuesta de la IA quedó incompleta. Inténtalo de nuevo.", "truncated");
        }
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        return { text, model: res.model };
      } catch (e) {
        if (e instanceof AiError) throw e;
        if (e instanceof Anthropic.AuthenticationError) throw new AiError("La API key de Anthropic no es válida.", "auth");
        if (e instanceof Anthropic.RateLimitError) throw new AiError("Anthropic limitó las solicitudes. Espera un momento e inténtalo de nuevo.", "rate_limit");
        if (e instanceof Anthropic.APIError) throw new AiError(`Error del proveedor de IA (${e.status ?? "red"}).`, "provider");
        throw new AiError("No se pudo conectar con el proveedor de IA.", "provider");
      }
    },
  };
}
