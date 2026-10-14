import { z } from "zod";
import { AOI_KINDS, type Aoi } from "../engine/aoi";
import { tileBoxToImage, type TilePlan } from "../engine/tiles";

export const VISION_ENGINE_VERSION = "nf-vision-1.0";

const score = z.object({ score: z.number().int().min(1).max(5), evidence: z.string().trim().min(1).max(400) });
const coord = z.number().min(0).max(1000);

export const pieceAiSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  message: z.string().trim().min(1).max(300),
  firstSeconds: z.string().trim().min(1).max(600),
  elements: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(8),
        label: z.string().trim().min(1).max(80),
        kind: z.enum(AOI_KINDS),
        tile: z.number().int().min(0).max(10).default(0),
        box: z.tuple([coord, coord, coord, coord]),
        attention: z.number().int().min(1).max(5),
        importance: z.number().int().min(1).max(5),
        order: z.number().int().min(1).max(50).nullable(),
      }),
    )
    .max(20),
  criteria: z.object({
    clarity: score,
    hierarchy: score,
    cta: score,
    legibility: score,
    brand: score,
    load: score,
  }),
  issues: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]),
        elementId: z.string().trim().max(8).nullable(),
        problem: z.string().trim().min(1).max(400),
        recommendation: z.string().trim().min(1).max(400),
      }),
    )
    .max(8),
  strengths: z.array(z.string().trim().min(1).max(300)).max(6),
  limitations: z.array(z.string().trim().min(1).max(300)).max(4),
});

export type PieceAiResult = z.infer<typeof pieceAiSchema>;

export const CRITERIA_LABEL: Record<keyof PieceAiResult["criteria"], string> = {
  clarity: "Claridad del mensaje",
  hierarchy: "Jerarquía visual",
  cta: "Visibilidad de la acción",
  legibility: "Legibilidad",
  brand: "Presencia de marca",
  load: "Carga visual (5 = ligera)",
};

const FORMAT = `{
  "summary": "lectura general en 2-4 frases",
  "message": "lo que comunica la pieza en una frase",
  "firstSeconds": "qué percibe alguien en los primeros 2-3 segundos",
  "elements": [ { "id": "E1", "label": "nombre corto", "kind": "${AOI_KINDS.join(" | ")}", "tile": 0, "box": [x0, y0, x1, y1], "attention": 1-5, "importance": 1-5, "order": 1 } ],
  "criteria": { "clarity": {"score": 1-5, "evidence": "..."}, "hierarchy": {...}, "cta": {...}, "legibility": {...}, "brand": {...}, "load": {...} },
  "issues": [ { "severity": "high | medium | low", "elementId": "E1 o null", "problem": "...", "recommendation": "..." } ],
  "strengths": ["..."],
  "limitations": ["..."]
}`;

export const PIECE_SYSTEM_PROMPT = `Eres especialista en neuromarketing visual, diseño publicitario y UX. Evalúas piezas gráficas, anuncios y capturas de sitios web para analistas en México y respondes en español.

QUÉ HACES
- Identificas los elementos visuales relevantes y estimas cuánto atraen la mirada (attention 1-5) usando principios de saliencia: rostros y miradas, contraste, tamaño, color, posición (patrones F/Z), texto grande, movimiento implícito y aislamiento.
- Estimas su importancia para el objetivo declarado (importance 1-5) y el orden probable de lectura ("order"; null si es poco probable que se mire).
- Calificas seis criterios de 1 a 5 citando evidencia visible concreta (texto que lees, posición, color, tamaño).

REGLAS
1. Es una ESTIMACIÓN experta, no eye tracking ni datos de personas reales. No inventes porcentajes, tiempos ni métricas.
2. Coordenadas: "box" en enteros 0-1000 relativos a la imagen indicada en "tile" (0 = primera imagen recibida), [x0, y0, x1, y1] con origen arriba a la izquierda. Ajusta las cajas al elemento, sin márgenes grandes.
3. Máximo 20 elementos; prioriza los que importan para el objetivo. Incluye siempre el CTA/acción principal si existe; si no existe, dilo en "issues".
4. "load": 5 = visualmente ligera y ordenada; 1 = saturada.
5. Si la imagen está recortada (página larga), menciónalo en "limitations".
6. Recomendaciones concretas y accionables (qué mover, agrandar, contrastar, quitar).

Responde SOLO con un objeto JSON válido, sin texto adicional, con esta estructura:
${FORMAT}`;

export function buildPieceUserText(ctx: {
  objective: string;
  brand: string;
  audience: string;
  title: string;
  placement: string | null;
  journey: { site: string; task: string } | null;
  tiles: number;
  coverage: number;
}): string {
  const lines = [
    `Pieza: «${ctx.title}»`,
    `Objetivo del estudio: ${ctx.objective}`,
    ctx.brand ? `Marca: ${ctx.brand}` : null,
    ctx.audience ? `Público: ${ctx.audience}` : null,
    ctx.placement ? `Formato/colocación: ${ctx.placement}` : null,
    ctx.journey ? `Captura del sitio «${ctx.journey.site}» durante la tarea: ${ctx.journey.task}` : null,
    ctx.tiles > 1
      ? `La imagen es alta y se envía en ${ctx.tiles} franjas consecutivas de arriba a abajo (tile 0 = la superior).${ctx.coverage < 1 ? ` Las franjas cubren el ${Math.round(ctx.coverage * 100)} % superior de la imagen.` : ""}`
      : null,
  ].filter(Boolean);
  return `${lines.join("\n")}\n\nAnaliza la pieza y responde con el JSON.`;
}

/** Elementos de la IA → AOIs (coordenadas 0–1 de la imagen completa). */
export function elementsToAois(result: PieceAiResult, plan: TilePlan): Aoi[] {
  return result.elements
    .map((e, i) => ({
      id: e.id || `E${i + 1}`,
      label: e.label,
      kind: e.kind,
      box: tileBoxToImage(plan, e.tile, e.box),
      attention: e.attention / 5,
      importance: e.importance,
      order: e.order,
    }))
    .filter((a) => a.box[2] - a.box[0] > 0.002 && a.box[3] - a.box[1] > 0.002);
}
