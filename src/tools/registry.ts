/**
 * Registro de herramientas de investigación. Un proyecto puede contener
 * estudios de distintas herramientas.
 */
export type ToolType = "iat" | "seo" | "visual";

export interface ToolDefinition {
  type: ToolType;
  name: string;
  shortName: string;
  description: string;
  newStudyPath: (projectId: string) => string;
}

export const TOOLS: ToolDefinition[] = [
  {
    type: "iat",
    name: "Test de Asociación Implícita (IAT)",
    shortName: "IAT",
    description:
      "Mide la fuerza de asociación implícita entre dos marcas u opciones y atributos (p. ej. confiable / poco confiable) a partir de tiempos de reacción.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/iat`,
  },
  {
    type: "seo",
    name: "Auditoría SEO",
    shortName: "SEO",
    description:
      "Rastrea un sitio (o analiza HTML subido) y revisa indexación, on-page, datos estructurados, enlaces y Core Web Vitals. La IA prioriza y redacta las recomendaciones.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/seo`,
  },
  {
    type: "visual",
    name: "Análisis visual con IA",
    shortName: "Visual",
    description:
      "Evalúa piezas gráficas, anuncios y capturas web: mapa de atención estimado, recorrido visual, zonas ciegas y métricas de imagen. Incluye el modo journey con el Índice de Fricción Digital (IFD).",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/visual`,
  },
];

export function getTool(type: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.type === type);
}
