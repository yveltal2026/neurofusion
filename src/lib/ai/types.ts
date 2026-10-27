/**
 * Capa de proveedores de IA, intercambiable por configuración (AI_PROVIDER).
 * Los proveedores sólo "completan chat" y devuelven texto; la validación del
 * formato (Zod) y el reintento viven en generateStructured, igual para todos.
 */
/** Imagen en base64 (sin prefijo data:). Sólo en mensajes del usuario. */
export interface ImagePart {
  type: "image";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "user" | "assistant";
  /** Texto, o partes de texto e imagen (visión) en mensajes del usuario. */
  content: string | ContentPart[];
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  /** Cancela la llamada (tiempo de espera por nivel de la cascada). */
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  /** Modelo que respondió (para guardarlo junto al análisis). */
  model: string;
}

export interface AnalysisProvider {
  readonly name: "anthropic" | "openai" | "gemini";
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/**
 * Error con mensaje apto para mostrar al investigador. `detail` es el dato técnico (código HTTP y
 * mensaje del proveedor) y sólo va a los logs del servidor, nunca a la interfaz.
 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "rate_limit" | "refusal" | "truncated" | "invalid_output" | "provider",
    readonly detail?: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Deja un texto técnico listo para un log: una línea, recortado y sin nada que parezca una API key. */
export function safeDetail(text: string, max = 240): string {
  return text
    .replace(/\b(AIza[\w-]{20,}|sk-[\w-]{16,})/g, "[clave]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
