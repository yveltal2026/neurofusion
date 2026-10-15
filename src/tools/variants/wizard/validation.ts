import { variantConfigSchema, type VariantConfig } from "../config";

export const VARIANT_STEPS = [
  { id: "design", title: "Diseño" },
  { id: "content", title: "Contenido" },
  { id: "params", title: "Parámetros" },
  { id: "texts", title: "Textos" },
  { id: "confirm", title: "Confirmar" },
] as const;

export type VariantStepId = (typeof VARIANT_STEPS)[number]["id"];

/** Qué paso del wizard edita cada parte de la configuración. */
const STEP_OF: Record<string, VariantStepId> = {
  variant: "design",
  concepts: "content",
  product: "content",
  attribute: "content",
  params: "params",
  texts: "texts",
  theme: "texts",
  deviceNotice: "texts",
};

/**
 * Errores de la configuración que pertenecen a un paso. El esquema es el mismo que valida el servidor, así que el
 * wizard no puede aceptar nada que el servidor rechace. «confirm» revisa todo.
 */
export function validateVariantStep(step: VariantStepId, config: VariantConfig): string[] {
  const parsed = variantConfigSchema.safeParse(config);
  if (parsed.success) return [];
  const messages = parsed.error.issues
    .filter((i) => step === "confirm" || STEP_OF[String(i.path[0])] === step)
    .map((i) => i.message);
  return [...new Set(messages)];
}
