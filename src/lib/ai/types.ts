/**
 * Capa de proveedores de IA, intercambiable por configuración (AI_PROVIDER).
 * Los proveedores sólo "completan chat" y devuelven texto; la validación del
 * formato (Zod) y el reintento viven en generateStructured, igual para todos.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
}

export interface CompletionResult {
  text: string;
  /** Modelo que respondió (para guardarlo junto al análisis). */
  model: string;
}

export interface AnalysisProvider {
  readonly name: "anthropic" | "openai";
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** Error con mensaje apto para mostrar al investigador. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "rate_limit" | "refusal" | "truncated" | "invalid_output" | "provider",
  ) {
    super(message);
    this.name = "AiError";
  }
}
