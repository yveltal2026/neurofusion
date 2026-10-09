import OpenAI from "openai";
import { AiError, type AnalysisProvider, type CompletionRequest, type CompletionResult } from "./types";

/** No fijamos un modelo por defecto: los nombres cambian seguido. Se exige OPENAI_MODEL. */
export function createOpenAiProvider(opts: { apiKey: string; model: string }): AnalysisProvider {
  const client = new OpenAI({ apiKey: opts.apiKey });

  return {
    name: "openai",
    model: opts.model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      try {
        const res = await client.chat.completions.create({
          model: opts.model,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: req.system }, ...req.messages],
        });
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
