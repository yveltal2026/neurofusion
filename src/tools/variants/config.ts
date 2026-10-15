import { z } from "zod";
import { MAX_WORDS_PER_POLE, MIN_WORDS_PER_POLE, conceptSchema, normalizeWord } from "@/tools/iat/config";

/**
 * Configuración de una variante del IAT (SC-IAT, Go/No-Go o priming evaluativo). Se guarda en
 * `studies.config` (tool_type = 'iat_variant') y se valida igual en el wizard y en el servidor.
 *
 * Los valores por defecto salen de la literatura citada en docs/METODOLOGIA.md pero NO están
 * cotejados contra los datos originales: son parámetros del estudio, editables en el wizard.
 */

export const VARIANT_IDS = ["sc_iat", "gnat", "priming"] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export const VARIANT_INFO: Record<VariantId, { name: string; short: string; minConcepts: number; maxConcepts: number; summary: string }> = {
  sc_iat: {
    name: "SC-IAT (IAT de categoría única)",
    short: "SC-IAT",
    minConcepts: 1,
    maxConcepts: 1,
    summary: "Mide la asociación de UNA marca con lo positivo o lo negativo, sin necesitar una marca de comparación.",
  },
  gnat: {
    name: "Go/No-Go (GNAT)",
    short: "GNAT",
    minConcepts: 1,
    maxConcepts: 2,
    summary: "El participante responde sólo a la combinación objetivo y se abstiene ante el resto. Mide sensibilidad (d′) de 1 o 2 marcas.",
  },
  priming: {
    name: "Priming evaluativo",
    short: "Priming",
    minConcepts: 1,
    maxConcepts: 2,
    summary: "Una marca aparece un instante antes de una palabra buena o mala. Si activa una evaluación, esa palabra se clasifica más rápido.",
  },
};

/** Variantes que el wizard puede ofrecer para un número de conceptos (1 o 2). */
export function variantsForConceptCount(n: number): VariantId[] {
  return VARIANT_IDS.filter((v) => n >= VARIANT_INFO[v].minConcepts && n <= VARIANT_INFO[v].maxConcepts);
}

const text = (max: number, min = 1) => z.string().trim().min(min, "Campo obligatorio").max(max, `Máximo ${max} caracteres`);
const word = z.string().trim().min(1).max(24, "Máximo 24 caracteres por palabra");

export const attributeSchema = z
  .object({
    name: text(60),
    positiveLabel: text(40),
    negativeLabel: text(40),
    positiveWords: z.array(word).min(MIN_WORDS_PER_POLE, `Mínimo ${MIN_WORDS_PER_POLE} palabras por polo`).max(MAX_WORDS_PER_POLE),
    negativeWords: z.array(word).min(MIN_WORDS_PER_POLE, `Mínimo ${MIN_WORDS_PER_POLE} palabras por polo`).max(MAX_WORDS_PER_POLE),
  })
  .superRefine((d, ctx) => {
    if (normalizeWord(d.positiveLabel) === normalizeWord(d.negativeLabel)) {
      ctx.addIssue({ code: "custom", path: ["negativeLabel"], message: "Los dos polos deben ser distintos" });
    }
    const seen = new Set<string>();
    for (const key of ["positiveWords", "negativeWords"] as const) {
      d[key].forEach((w, i) => {
        const n = normalizeWord(w);
        if (seen.has(n)) ctx.addIssue({ code: "custom", path: [key, i], message: `La palabra «${w}» está repetida` });
        seen.add(n);
      });
    }
  });

export const scParamsSchema = z.object({
  /** Ventana de respuesta en ms: sin respuesta a tiempo cuenta como error (SC-IAT original: 1500 ms). */
  windowMs: z.number().int().min(800).max(3000),
  /** Ensayos de práctica por emparejamiento (original: 24). */
  practiceTrials: z.number().int().min(6).max(48),
  /** Ensayos de prueba por emparejamiento (original: 72). */
  testTrials: z.number().int().min(12).max(120),
});

export const gnatParamsSchema = z.object({
  /** Tiempo máximo para responder antes de que el estímulo desaparezca, en ms. */
  deadlineMs: z.number().int().min(400).max(1500),
  /** Ensayos por bloque de medición (mitad señal, mitad ruido). */
  trialsPerBlock: z
    .number()
    .int()
    .min(20)
    .max(80)
    .refine((n) => n % 2 === 0, "Debe ser un número par"),
  /** Ensayos de práctica (con retroalimentación) antes de cada bloque. */
  practiceTrials: z.number().int().min(0).max(16),
});

export const primingParamsSchema = z.object({
  /** Tiempo que el prime (la marca) permanece en pantalla, en ms. */
  primeMs: z.number().int().min(30).max(500),
  /** Pantalla en blanco entre prime y palabra, en ms. SOA = primeMs + blankMs. */
  blankMs: z.number().int().min(0).max(500),
  /** Tiempo máximo para clasificar la palabra, en ms. */
  maxResponseMs: z.number().int().min(800).max(4000),
  /** Cuántas veces se presenta cada combinación prime × palabra. */
  repetitions: z.number().int().min(1).max(4),
  /** Ensayos de práctica con retroalimentación. */
  practiceTrials: z.number().int().min(0).max(16),
});

export const DEFAULT_PARAMS = {
  sc_iat: { windowMs: 1500, practiceTrials: 24, testTrials: 72 },
  gnat: { deadlineMs: 700, trialsPerBlock: 40, practiceTrials: 8 },
  priming: { primeMs: 200, blankMs: 100, maxResponseMs: 2000, repetitions: 2, practiceTrials: 8 },
} as const;

const baseShape = {
  version: z.literal(1),
  product: text(120),
  concepts: z.array(conceptSchema).min(1).max(2),
  attribute: attributeSchema,
  theme: z.object({
    mode: z.enum(["neutral", "custom"]),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
      .optional(),
  }),
  texts: z.object({ consent: text(4000), thankYou: text(1000) }),
  deviceNotice: z.enum(["inform", "suggest_desktop"]),
};

export const variantConfigSchema = z
  .discriminatedUnion("variant", [
    z.object({ ...baseShape, variant: z.literal("sc_iat"), params: scParamsSchema }),
    z.object({ ...baseShape, variant: z.literal("gnat"), params: gnatParamsSchema }),
    z.object({ ...baseShape, variant: z.literal("priming"), params: primingParamsSchema }),
  ])
  .superRefine((c, ctx) => {
    const info = VARIANT_INFO[c.variant];
    if (c.concepts.length < info.minConcepts || c.concepts.length > info.maxConcepts) {
      ctx.addIssue({
        code: "custom",
        path: ["concepts"],
        message:
          info.minConcepts === info.maxConcepts
            ? `${info.short} usa exactamente ${info.minConcepts} concepto`
            : `${info.short} admite de ${info.minConcepts} a ${info.maxConcepts} conceptos`,
      });
    }
    if (c.concepts.length === 2 && normalizeWord(c.concepts[0].label) === normalizeWord(c.concepts[1].label)) {
      ctx.addIssue({ code: "custom", path: ["concepts", 1, "label"], message: "Los dos conceptos deben tener nombres distintos" });
    }
    if (c.theme.mode === "custom" && !c.theme.accent) {
      ctx.addIssue({ code: "custom", path: ["theme", "accent"], message: "Elige un color" });
    }
    // Un estímulo no puede estar a la vez en un concepto y en el atributo (el servidor no podría decidir la respuesta correcta).
    const attr = new Set([...c.attribute.positiveWords, ...c.attribute.negativeWords].map(normalizeWord));
    c.concepts.forEach((concept, ci) =>
      concept.stimuli.forEach((s, si) => {
        if (attr.has(normalizeWord(s))) {
          ctx.addIssue({ code: "custom", path: ["concepts", ci, "stimuli", si], message: `«${s}» también es una palabra del atributo` });
        }
      }),
    );
  });

export type VariantConfig = z.infer<typeof variantConfigSchema>;
export type ScIatConfig = Extract<VariantConfig, { variant: "sc_iat" }>;
export type GnatConfig = Extract<VariantConfig, { variant: "gnat" }>;
export type PrimingConfig = Extract<VariantConfig, { variant: "priming" }>;

export function defaultVariantConsent(product: string): string {
  return [
    `Estás invitado(a) a participar en un estudio sobre ${product || "percepción de marcas"}.`,
    "Verás palabras en pantalla y tendrás que clasificarlas lo más rápido que puedas, con el teclado o tocando la pantalla. Dura pocos minutos.",
    "Tu participación es voluntaria y confidencial: no te pedimos nombre ni correo, y tus respuestas se analizan de forma agregada con fines de investigación.",
    "Puedes abandonar el estudio en cualquier momento cerrando esta ventana. Al continuar confirmas que tienes 18 años o más y que aceptas participar.",
  ].join("\n\n");
}
