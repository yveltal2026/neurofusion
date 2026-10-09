import { z } from "zod";

/** Conclusiones que redacta la IA. Las cifras y gráficas oficiales salen del motor, no de aquí. */
export const analysisResultSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(1500),
  findings: z
    .array(
      z.object({
        dimension: z.string().trim().min(1).max(80),
        headline: z.string().trim().min(1).max(200),
        interpretation: z.string().trim().min(1).max(1200),
      }),
    )
    .max(8),
  implicitVsExplicit: z.object({
    consistency: z.enum(["high", "mixed", "low", "insufficient_data"]),
    summary: z.string().trim().min(1).max(1200),
  }),
  segments: z
    .array(z.object({ variable: z.string().trim().min(1).max(80), insight: z.string().trim().min(1).max(800) }))
    .max(8),
  deviceNote: z.string().trim().max(600).nullable().default(null),
  limitations: z.array(z.string().trim().min(1).max(500)).max(8),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(8),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const CONSISTENCY_LABEL: Record<AnalysisResult["implicitVsExplicit"]["consistency"], string> = {
  high: "Alta consistencia",
  mixed: "Consistencia mixta",
  low: "Baja consistencia (disonancia)",
  insufficient_data: "Datos insuficientes",
};

/** Ejemplo del formato, incluido en el prompt para que el modelo lo imite. */
export const RESULT_FORMAT_EXAMPLE = `{
  "executiveSummary": "texto de 2-4 frases con la conclusión principal",
  "findings": [
    { "dimension": "nombre de la dimensión", "headline": "titular corto", "interpretation": "interpretación con las cifras dadas" }
  ],
  "implicitVsExplicit": { "consistency": "high | mixed | low | insufficient_data", "summary": "texto" },
  "segments": [ { "variable": "nombre de la variable", "insight": "hallazgo" } ],
  "deviceNote": "texto o null",
  "limitations": ["..."],
  "recommendations": ["..."]
}`;
