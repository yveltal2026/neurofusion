import { z } from "zod";
import type { RubricItem } from "../journey/rubric";

export const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(40),
        value: z.number().min(0).max(1),
        justification: z.string().trim().min(10).max(600),
        evidenceImage: z.number().int().min(0).max(20).nullable(),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(20),
  notObservable: z.array(z.string().trim().min(1).max(300)).max(10),
});

export type SuggestionsResult = z.infer<typeof suggestionsSchema>;

export const SUGGEST_SYSTEM_PROMPT = `Eres un analista de UX de comercio electrónico. Recibes capturas del recorrido de compra de un sitio y una rúbrica. Propones calificaciones para que un analista humano las revise; tú NO decides.

REGLAS
1. Califica sólo lo que se ve en las capturas. Si algo no es observable (p. ej. si exige login y no hay captura del carrito), NO lo califiques: inclúyelo en "notObservable".
2. Usa los valores de las anclas de la rúbrica (puedes usar intermedios). "login_obligatorio_carrito" sólo admite 0 o 1. Las bases de éxito van de 0.04 a 0.97.
3. La justificación cita lo visible (texto, posición, ausencia de un elemento) y "evidenceImage" es el índice (0 = primera) de la captura que lo respalda.
4. "confidence": qué tan seguro estás con base en las capturas.
5. Español, conciso.

Responde SOLO con un objeto JSON válido:
{ "suggestions": [ { "item": "clave del ítem", "value": 0.5, "justification": "...", "evidenceImage": 0, "confidence": "low | medium | high" } ], "notObservable": ["..."] }`;

export function buildSuggestText(ctx: {
  site: string;
  url: string;
  productTarget: string;
  items: RubricItem[];
  images: { index: number; task: string; title: string }[];
}): string {
  return [
    `Sitio: ${ctx.site} (${ctx.url})`,
    ctx.productTarget ? `Producto objetivo del recorrido: ${ctx.productTarget}` : null,
    `Capturas recibidas (en orden):`,
    ...ctx.images.map((i) => `  [${i.index}] ${i.task} · ${i.title}`),
    ``,
    `Rúbrica:`,
    ...ctx.items.map((it) => `- ${it.key}: ${it.question} Anclas: ${it.anchors.map((a) => `${a.value} = ${a.label}`).join("; ")}`),
  ]
    .filter((x) => x !== null)
    .join("\n");
}
