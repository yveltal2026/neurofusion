/**
 * Registro de herramientas de investigación. Un proyecto puede contener
 * estudios de distintas herramientas.
 */
import type { IconName } from "@/components/brand/icon";

export type ToolType = "iat" | "seo" | "visual" | "survey" | "iat_variant";

export interface ToolDefinition {
  type: ToolType;
  name: string;
  shortName: string;
  icon: IconName;
  description: string;
  newStudyPath: (projectId: string) => string;
}

export const TOOLS: ToolDefinition[] = [
  {
    type: "iat",
    name: "Test de Asociación Implícita (IAT)",
    shortName: "IAT",
    icon: "neuro",
    description:
      "Mide la fuerza de asociación implícita entre dos marcas u opciones y atributos (p. ej. confiable / poco confiable) a partir de tiempos de reacción.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/iat`,
  },
  {
    type: "seo",
    name: "Auditoría SEO",
    shortName: "SEO",
    icon: "search",
    description:
      "Rastrea un sitio (o analiza HTML subido) y revisa indexación, on-page, datos estructurados, enlaces y Core Web Vitals. La IA prioriza y redacta las recomendaciones.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/seo`,
  },
  {
    type: "visual",
    name: "Análisis visual con IA",
    shortName: "Visual",
    icon: "eye",
    description:
      "Evalúa piezas gráficas, anuncios y capturas web: mapa de atención estimado, recorrido visual, zonas ciegas y métricas de imagen. Incluye el modo journey con el Índice de Fricción Digital (IFD).",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/visual`,
  },
  {
    type: "survey",
    name: "Encuesta",
    shortName: "Encuesta",
    icon: "survey",
    description:
      "Preguntas propias e instrumentos estandarizados (SUS, NPS, SAM, intención de compra, actitud). El servidor valida y puntúa; los resultados salen con intervalos de confianza y CSV.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/survey`,
  },
  {
    type: "iat_variant",
    name: "Variantes del IAT (SC-IAT, Go/No-Go, priming)",
    shortName: "Variantes IAT",
    icon: "bolt",
    description:
      "Mide una sola marca sin comparación (SC-IAT) o con una o dos marcas por Go/No-Go y priming evaluativo. El servidor valida los tiempos y puntúa; los resultados traen advertencias de calidad.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/variants`,
  },
];

export function getTool(type: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.type === type);
}
