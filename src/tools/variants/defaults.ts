import { DEFAULT_THANK_YOU } from "@/tools/iat/config";
import { DEFAULT_PARAMS, defaultVariantConsent, variantConfigSchema, variantsForConceptCount, type VariantConfig, type VariantId } from "./config";

const POSITIVE = ["Confiable", "Excelente", "Agradable", "Genial", "Seguro", "Valioso"];
const NEGATIVE = ["Deficiente", "Molesto", "Terrible", "Inseguro", "Desagradable", "Malo"];

/** Configuración inicial (y válida) de una variante para un número de conceptos. */
export function defaultVariantConfig(variant: VariantId, conceptCount: 1 | 2 = 1): VariantConfig {
  const concepts = [
    { label: "Marca A", stimuli: ["Marca A"] },
    { label: "Marca B", stimuli: ["Marca B"] },
  ].slice(0, conceptCount);
  const common = {
    version: 1 as const,
    product: "Producto de ejemplo",
    concepts,
    attribute: {
      name: "Valoración",
      positiveLabel: "Bueno",
      negativeLabel: "Malo",
      positiveWords: [...POSITIVE],
      negativeWords: [...NEGATIVE],
    },
    theme: { mode: "neutral" as const },
    texts: { consent: defaultVariantConsent("Producto de ejemplo"), thankYou: DEFAULT_THANK_YOU },
    deviceNotice: "inform" as const,
  };
  switch (variant) {
    case "sc_iat":
      return { ...common, variant, params: { ...DEFAULT_PARAMS.sc_iat } };
    case "gnat":
      return { ...common, variant, params: { ...DEFAULT_PARAMS.gnat } };
    case "priming":
      return { ...common, variant, params: { ...DEFAULT_PARAMS.priming } };
  }
}

/** Igual que `defaultVariantConfig` pero lanza si no valida (sólo para fixtures y pruebas). */
export function validVariantConfig<V extends VariantId>(variant: V, conceptCount: 1 | 2 = 1): Extract<VariantConfig, { variant: V }> {
  return variantConfigSchema.parse(defaultVariantConfig(variant, conceptCount)) as Extract<VariantConfig, { variant: V }>;
}

/** Cambia de variante conservando todo el contenido; los parámetros vuelven a los valores por defecto de la nueva. */
export function withVariant(config: VariantConfig, variant: VariantId): VariantConfig {
  const base = defaultVariantConfig(variant, config.concepts.length === 2 ? 2 : 1);
  return {
    ...base,
    product: config.product,
    concepts: config.concepts,
    attribute: config.attribute,
    theme: config.theme,
    texts: config.texts,
    deviceNotice: config.deviceNotice,
  } as VariantConfig;
}

/**
 * Cambia el número de conceptos. Si la variante actual no admite ese número (el SC-IAT sólo admite uno),
 * se pasa a la primera que sí lo admite: el wizard nunca deja armar una combinación inválida.
 */
export function withConceptCount(config: VariantConfig, count: 1 | 2): VariantConfig {
  const concepts = count === 1 ? config.concepts.slice(0, 1) : [...config.concepts, ...defaultVariantConfig(config.variant, 2).concepts.slice(config.concepts.length)];
  const offered = variantsForConceptCount(count);
  const variant = offered.includes(config.variant) ? config.variant : offered[0];
  const next = variant === config.variant ? config : withVariant(config, variant);
  return { ...next, concepts } as VariantConfig;
}
