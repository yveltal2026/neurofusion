import { z } from "zod";
import { AOI_KINDS, type Aoi } from "../engine/aoi";
import { tileBoxToImage, type TilePlan } from "../engine/tiles";
import {
  PREDICTION_PROMPT,
  predictedEyeMetricsSchema,
  predictionContextSchema,
} from "./prediction";

export const VISION_ENGINE_VERSION = "nf-vision-1.3";

const score = z.object({
  score: z.number().int().min(1).max(5),
  evidence: z.string().trim().min(1).max(400),
});
const coord = z.number().min(0).max(1000);

/**
 * Cajas de la IA. El orden de las coordenadas es el punto frágil: Gemini devuelve de forma
 * nativa [ymin, xmin, ymax, xmax] (convención de Google, 0–1000) y los demás modelos suelen
 * asumir [x, y, x, y]; con un orden ambiguo las cajas salen transpuestas (y con ellas el mapa
 * de calor). Por eso el prompt pide `box2d` con el orden dicho explícitamente. `box` se acepta
 * sólo para análisis guardados antes de nf-vision-1.1, que usaban [x0, y0, x1, y1].
 */
const boxFields = z.object({
  box2d: z.tuple([coord, coord, coord, coord]).optional(),
  box: z.tuple([coord, coord, coord, coord]).optional(),
});

export const MAX_ELEMENTS = 25;

export const elementSchema = z
  .object({
    id: z.string().trim().min(1).max(8),
    label: z.string().trim().min(1).max(80),
    kind: z.enum(AOI_KINDS),
    tile: z.number().int().min(0).max(10).default(0),
    ...boxFields.shape,
    attention: z.number().int().min(1).max(5),
    importance: z.number().int().min(1).max(5),
    order: z.number().int().min(1).max(50).nullable(),
    /** Optional only for analyses stored before nf-vision-1.3. */
    eyeMetrics: predictedEyeMetricsSchema.optional(),
  })
  .refine(
    (e) => e.box2d !== undefined || e.box !== undefined,
    "Cada elemento necesita «box2d»",
  );

export type PieceElement = z.infer<typeof elementSchema>;

export const pieceAiSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  message: z.string().trim().min(1).max(300),
  firstSeconds: z.string().trim().min(1).max(600),
  elements: z.array(elementSchema).max(MAX_ELEMENTS),
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
  predictionContext: predictionContextSchema.optional(),
});

export type PieceAiResult = z.infer<typeof pieceAiSchema>;

const visionElementSchema = elementSchema.safeExtend({
  eyeMetrics: predictedEyeMetricsSchema,
});
/** New generations require predictions; the storage reader still accepts legacy analyses. */
export const pieceVisionSchema = pieceAiSchema
  .extend({ elements: z.array(visionElementSchema).max(MAX_ELEMENTS) })
  .superRefine((r, ctx) => {
    if (new Set(r.elements.map((e) => e.id)).size !== r.elements.length)
      ctx.addIssue({
        code: "custom",
        message: "Los identificadores de elementos deben ser únicos",
      });
  });

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
  "elements": [ { "id": "E1", "label": "nombre corto", "kind": "${AOI_KINDS.join(" | ")}", "tile": 0, "box2d": [ymin, xmin, ymax, xmax], "attention": 1-5, "importance": 1-5, "order": 1, "eyeMetrics": { "ttffMs": 300, "fixationCount": 2, "meanFixationDurationMs": 250, "dwellTimeMs": 650, "hitRatePct": 70, "firstFixationPct": 30, "visitCount": 1, "rationale": "evidencia y supuesto específicos del elemento; no copies estos valores de ejemplo" } } ],
  "criteria": { "clarity": {"score": 1-5, "evidence": "..."}, "hierarchy": {...}, "cta": {...}, "legibility": {...}, "brand": {...}, "load": {...} },
  "issues": [ { "severity": "high | medium | low", "elementId": "E1 o null", "problem": "...", "recommendation": "..." } ],
  "strengths": ["..."],
  "limitations": ["..."]
}`;

export const PIECE_SYSTEM_PROMPT = `Eres especialista en neuromarketing visual, diseño publicitario y UX. Evalúas piezas gráficas, anuncios y capturas de sitios web para analistas en México y respondes en español.

QUÉ HACES
- Identificas TODOS los elementos visuales con significado para el objetivo y estimas cuánto atraen la mirada (attention 1-5) usando principios de saliencia: rostros y miradas, contraste, tamaño, color, posición (patrones F/Z), texto grande, movimiento implícito y aislamiento.
- Estimas su importancia para el objetivo declarado (importance 1-5) y el orden probable de lectura ("order").
- Calificas seis criterios de 1 a 5 citando evidencia visible concreta (texto que lees, posición, color, tamaño).

REGLAS
1. Es una ESTIMACIÓN experta, no eye tracking ni datos de personas reales. Sólo "eyeMetrics" contiene hipótesis numéricas no validadas bajo el escenario indicado; nunca descríbelas como mediciones o resultados observados.
2. Coordenadas: "box2d" son 4 enteros 0-1000 relativos a la imagen indicada en "tile" (0 = primera imagen recibida), en este orden EXACTO: [ymin, xmin, ymax, xmax]. Primero los valores VERTICALES (ymin = borde superior, ymax = borde inferior) y después los HORIZONTALES (xmin = borde izquierdo, xmax = borde derecho). El origen [0, 0] es la esquina superior izquierda y [1000, 1000] la inferior derecha. Se debe cumplir ymin < ymax y xmin < xmax. Ajusta cada caja al elemento, sin márgenes grandes. En un texto de VARIAS líneas la caja debe abarcar TODAS las líneas, hasta el extremo derecho de la línea más ancha (no sólo la primera línea ni la mitad del texto). Comprueba que realmente encierre lo que dice su "label" (p. ej. un elemento de la parte baja de la imagen debe tener ymin y ymax altos).
3. COBERTURA: lista todo elemento que importe para el objetivo, también los pequeños, periféricos o de bajo contraste: logotipos, titulares, texto de apoyo, sellos de confianza o garantías, precios y plazos, condiciones o letra chica, botones y llamados a la acción, y CADA medio de contacto (correo, teléfono, WhatsApp, sitio web, redes) por separado. No agrupes elementos distintos en una sola caja; sólo agrupa una serie de elementos repetidos del mismo tipo (p. ej. cuatro iconos de beneficios). Máximo ${MAX_ELEMENTS} elementos; si hay más, prioriza los que importan para el objetivo. Incluye siempre el CTA/acción principal si existe; si no existe, dilo en "issues".
4. "attention" mide cuánto atrae la mirada POR SALIENCIA VISUAL (tamaño, contraste, color, posición, aislamiento), NO qué tan importante es. Un elemento importante pero pequeño, de bajo contraste (p. ej. letras claras sobre fondo oscuro) o en una esquina debe tener attention 1 o 2. No subas la atención de algo sólo porque sea importante.
5. "importance" depende del objetivo del estudio: los medios de contacto, los llamados a la acción, las garantías o sellos de confianza y las condiciones clave suelen ser 4 o 5 cuando el objetivo es conseguir que la persona actúe.
6. "order" es la secuencia en que una persona recorrería la pieza. Asígnalo a todo elemento que alguien podría llegar a mirar, aunque sea al final; usa null sólo para elementos decorativos o que prácticamente nadie leería.
7. "load": 5 = visualmente ligera y ordenada; 1 = saturada.
8. Si la imagen está recortada (página larga), menciónalo en "limitations".
9. Recomendaciones concretas y accionables (qué mover, agrandar, contrastar, quitar).
10. Antes de responder, vuelve a revisar la imagen de arriba abajo y comprueba que no dejaste fuera texto legible ni ningún elemento de contacto, sello, precio o botón.
11. Expón tanto aciertos como debilidades observables, con evidencia específica de esta imagen. Prioriza hasta tres problemas principales según su impacto en el objetivo. Asocia "elementId" cuando corresponda y explica qué cambiar; no rellenes fortalezas ni defectos que no puedas fundamentar.

${PREDICTION_PROMPT}

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
    ctx.journey
      ? `Captura del sitio «${ctx.journey.site}» durante la tarea: ${ctx.journey.task}`
      : null,
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
      box: tileBoxToImage(plan, e.tile, boxXyxy(e)),
      attention: e.attention / 5,
      importance: e.importance,
      order: e.order,
    }))
    .filter((a) => a.box[2] - a.box[0] > 0.002 && a.box[3] - a.box[1] > 0.002);
}

/** Caja de un elemento como [x0, y0, x1, y1] (0–1000), venga de `box2d` ([y, x, y, x]) o del `box` anterior. */
export function boxXyxy(e: PieceElement): [number, number, number, number] {
  if (e.box2d) {
    const [ymin, xmin, ymax, xmax] = e.box2d;
    return [xmin, ymin, xmax, ymax];
  }
  return e.box ?? [0, 0, 0, 0];
}

function iou(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const area = (r: [number, number, number, number]) =>
    Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  return inter / (area(a) + area(b) - inter || 1);
}

/** Segunda pasada: la IA sólo devuelve lo que FALTA en la lista (o una lista vacía). */
export const reviewSchema = z.object({
  missing: z.array(elementSchema).max(15),
});
export const visionReviewSchema = z.object({
  missing: z.array(visionElementSchema).max(15),
});

export const REVIEW_SYSTEM_PROMPT = `Eres revisor de una lectura visual de piezas publicitarias y capturas de sitios web. Recibes la imagen (o sus franjas) y la lista de elementos YA identificados por otro analista, y tu única tarea es encontrar los elementos relevantes que FALTAN.

REGLAS
1. Busca sobre todo lo pequeño, periférico o de bajo contraste: medios de contacto (correo, teléfono, WhatsApp, sitio web, redes), sellos de confianza o garantías, plazos, condiciones o letra chica, URLs, textos de apoyo, botones y logotipos. Cada medio de contacto va por separado.
2. No repitas elementos que ya están en la lista, aunque tengan otra etiqueta. Si la lista está completa, responde con una lista vacía.
3. Mismo formato de elemento que en la lista: "box2d" son 4 enteros 0-1000 relativos a la imagen de su "tile", en el orden EXACTO [ymin, xmin, ymax, xmax] (primero los valores verticales, luego los horizontales; origen arriba a la izquierda; ymin < ymax y xmin < xmax). Ajusta la caja al elemento.
4. "attention" (1-5) es cuánto atrae la mirada por saliencia visual (tamaño, contraste, color, posición); un elemento pequeño, de bajo contraste o en una esquina es 1 o 2 aunque sea importante. "importance" (1-5) depende del objetivo del estudio. "order": secuencia probable de lectura, o null si es decorativo.
5. Usa ids nuevos que no estén en la lista (E90, E91, …).

${PREDICTION_PROMPT}

Responde SOLO con un objeto JSON válido, sin texto adicional: { "missing": [ { "id": "E90", "label": "…", "kind": "${AOI_KINDS.join(" | ")}", "tile": 0, "box2d": [ymin, xmin, ymax, xmax], "attention": 1-5, "importance": 1-5, "order": 1, "eyeMetrics": { ...formato y reglas de predicciones anteriores... } } ] }`;

export function buildReviewUserText(
  existing: PieceElement[],
  ctx: { objective: string; brand: string; tiles: number },
): string {
  const rows = existing.map((e) => {
    const [x0, y0, x1, y1] = boxXyxy(e);
    return `${e.id} | ${e.label} | ${e.kind} | tile ${e.tile} | box2d [${Math.round(y0)}, ${Math.round(x0)}, ${Math.round(y1)}, ${Math.round(x1)}]`;
  });
  return [
    `Objetivo del estudio: ${ctx.objective}`,
    ctx.brand ? `Marca: ${ctx.brand}` : null,
    ctx.tiles > 1
      ? `La imagen se envía en ${ctx.tiles} franjas consecutivas de arriba a abajo (tile 0 = la superior).`
      : null,
    "",
    "Elementos ya identificados (id | etiqueta | tipo | tile | caja):",
    rows.join("\n") || "(ninguno)",
    "",
    "Devuelve únicamente los elementos que faltan.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Suma los elementos que la segunda pasada encontró. Descarta los que se traslapan (IoU ≥ 0.5) con
 * uno ya existente de la misma franja, les asigna ids nuevos y los pone al final del recorrido
 * visual (sus números de orden son relativos a la pasada, no a la lectura principal).
 */
export function mergeMissingElements(
  result: PieceAiResult,
  missing: PieceElement[],
): PieceAiResult {
  const used = new Set(result.elements.map((e) => e.id));
  let maxOrder = result.elements.reduce((m, e) => Math.max(m, e.order ?? 0), 0);
  const added: PieceElement[] = [];
  let next = 1;
  const ordered = [...missing].sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity),
  );
  for (const m of ordered) {
    if (result.elements.length + added.length >= MAX_ELEMENTS) break;
    const mb = boxXyxy(m);
    const dup = [...result.elements, ...added].some(
      (e) => e.tile === m.tile && iou(boxXyxy(e), mb) >= 0.5,
    );
    if (dup) continue;
    while (used.has(`E${next}`)) next++;
    const id = `E${next}`;
    used.add(id);
    added.push({
      ...m,
      id,
      order: m.order === null ? null : Math.min(50, ++maxOrder),
    });
  }
  return added.length
    ? { ...result, elements: [...result.elements, ...added] }
    : result;
}
