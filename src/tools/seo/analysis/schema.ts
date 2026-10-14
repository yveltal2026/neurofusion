import { z } from "zod";

const level = z.enum(["high", "medium", "low"]);

/** Lo que redacta la IA. Los hallazgos y cifras oficiales salen del motor. */
export const seoAiResultSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(1500),
  priorities: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        rationale: z.string().trim().min(1).max(800),
        actions: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
        impact: level,
        effort: level,
        rules: z.array(z.string().trim().max(60)).max(10).default([]),
      }),
    )
    .max(10),
  quickWins: z.array(z.string().trim().min(1).max(300)).max(8),
  rewrites: z
    .array(
      z.object({
        url: z.string().trim().max(2000),
        field: z.enum(["title", "description", "h1"]),
        current: z.string().trim().max(400).nullable(),
        proposal: z.string().trim().min(1).max(400),
        reason: z.string().trim().min(1).max(300),
      }),
    )
    .max(10),
  limitations: z.array(z.string().trim().min(1).max(400)).max(6),
});

export type SeoAiResult = z.infer<typeof seoAiResultSchema>;

export const LEVEL_LABEL = { high: "Alto", medium: "Medio", low: "Bajo" } as const;

export const SEO_RESULT_FORMAT = `{
  "executiveSummary": "2-4 frases con el estado del sitio y lo más urgente",
  "priorities": [
    { "title": "titular de la prioridad", "rationale": "por qué importa, citando los hallazgos",
      "actions": ["paso concreto"], "impact": "high | medium | low", "effort": "high | medium | low",
      "rules": ["id de regla relacionada, p. ej. meta.description"] }
  ],
  "quickWins": ["cambio pequeño de alto retorno"],
  "rewrites": [ { "url": "https://...", "field": "title | description | h1", "current": "texto actual o null", "proposal": "propuesta", "reason": "por qué" } ],
  "limitations": ["qué no cubre esta auditoría"]
}`;
