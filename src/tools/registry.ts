/**
 * Registro de herramientas de investigación. Un proyecto puede contener
 * estudios de distintas herramientas; V1 sólo registra el IAT.
 */
export type ToolType = "iat";

export interface ToolDefinition {
  type: ToolType;
  name: string;
  description: string;
  duration: string;
  requirement: string;
  metric: string;
  newStudyPath: (projectId: string) => string;
}

export const TOOLS: ToolDefinition[] = [
  {
    type: "iat",
    name: "Test de Asociación Implícita (IAT)",
    description:
      "Mide la fuerza de asociación implícita entre dos marcas u opciones y atributos (p. ej. confiable / poco confiable) a partir de tiempos de reacción.",
    duration: "3–7 min por participante",
    requirement: "Teclado recomendado (compatible con móvil)",
    metric: "Puntaje D (Greenwald et al.)",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/iat`,
  },
];

export function getTool(type: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.type === type);
}
