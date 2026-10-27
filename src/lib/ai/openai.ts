import OpenAI from "openai";
import { AiError, type AnalysisProvider, type ChatMessage, type CompletionRequest, type CompletionResult } from "./types";

/** Traduce los mensajes neutros al formato de OpenAI (imágenes como data URL). */
export function toOpenAiMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.ChatCompletionMessageParam => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    if (m.role === "assistant") {
      return { role: "assistant", content: m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("") };
    }
    return {
      role: "user",
      content: m.content.map((p): OpenAI.ChatCompletionContentPart =>
        p.type === "text"
          ? { type: "text", text: p.text }
          : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
      ),
    };
  });
}

/** No fijamos un modelo por defecto: los nombres cambian seguido. Se exige OPENAI_MODEL. */
export function createOpenAiProvider(opts: { apiKey: string; model: string; maxRetries?: number }): AnalysisProvider {
  const client = new OpenAI({ apiKey: opts.apiKey, maxRetries: opts.maxRetries });

  return {
    name: "openai",
    model: opts.model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      try {
        const res = await client.chat.completions.create(
          {
            model: opts.model,
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: req.system }, ...toOpenAiMessages(req.messages)],
          },
          { signal: req.signal },
        );
        const choice = res.choices[0];
        if (choice?.finish_reason === "length") throw new AiError("La respuesta de la IA quedó incompleta. Inténtalo de nuevo.", "truncated");
        if (choice?.finish_reason === "content_filter" || choice?.message.refusal) {
          throw new AiError("El modelo rechazó la solicitud. Revisa el contenido del estudio e inténtalo de nuevo.", "refusal");
        }
        return { text: choice?.message.content ?? "", model: res.model };
      } catch (e) {
        if (e instanceof AiError) throw e;
        if (e instanceof OpenAI.AuthenticationError) throw new AiError("La API key de OpenAI no es válida.", "auth");
        if (e instanceof OpenAI.RateLimitError) throw new AiError("OpenAI limitó las solicitudes. Espera un momento e inténtalo de nuevo.", "rate_limit");
        if (e instanceof OpenAI.APIError) throw new AiError(`Error del proveedor de IA (${e.status ?? "red"}).`, "provider");
        throw new AiError("No se pudo conectar con el proveedor de IA.", "provider");
      }
    },
  };
}
