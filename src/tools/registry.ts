/**
 * Registro de herramientas de investigación. Un proyecto puede contener
 * estudios de distintas herramientas.
 */
import type { IconName } from "@/components/brand/icon";

export type ToolType =
  "iat" | "seo" | "visual" | "web_visual" | "web_eyetracking" | "survey" | "iat_variant" | "eyetracking";

export const TOOL_CATEGORIES = [
  { id: "attention", name: "Atención visual", question: "¿Qué miran?" },
  {
    id: "association",
    name: "Asociaciones implícitas",
    question: "¿Qué asocian?",
  },
  { id: "perception", name: "Percepción y opinión", question: "¿Qué opinan?" },
  {
    id: "digital",
    name: "Diagnóstico digital",
    question: "¿Cómo funciona tu sitio?",
  },
] as const;

export interface ToolDefinition {
  type: ToolType;
  category: (typeof TOOL_CATEGORIES)[number]["id"];
  name: string;
  shortName: string;
  icon: IconName;
  description: string;
  newStudyPath: (projectId: string) => string;
}

export const TOOLS: ToolDefinition[] = [
  {
    type: "iat",
    category: "association",
    name: "Test de Asociación Implícita (IAT)",
    shortName: "IAT",
    icon: "neuro",
    description:
      "Mide la fuerza de asociación implícita entre dos marcas u opciones y atributos (p. ej. confiable / poco confiable) a partir de tiempos de reacción.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/iat`,
  },
  {
    type: "seo",
    category: "digital",
    name: "Auditoría SEO",
    shortName: "SEO",
    icon: "search",
    description:
      "Rastrea un sitio (o analiza HTML subido) y revisa indexación, on-page, datos estructurados, enlaces y Core Web Vitals. La IA prioriza y redacta las recomendaciones.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/seo`,
  },
  {
    type: "web_visual",
    category: "digital",
    name: "Análisis de Imagen Web",
    shortName: "Imagen Web",
    icon: "eye",
    description:
      "Evalúa capturas de pantalla de un sitio (desktop o móvil): atención visual estimada, jerarquía, visibilidad del CTA, zonas ciegas y fricción UX.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/web-visual`,
  },
  {
    type: "web_eyetracking",
    category: "digital",
    name: "Eyetracking para Web",
    shortName: "Eye Web",
    icon: "eye",
    description:
      "Mide la mirada real de participantes en tu sitio web mediante snippet en el <head> (estilo RealEye) o con capturas web sin código, guiados por pasos e instrucciones.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/web-eyetracking`,
  },
  {
    type: "visual",
    category: "attention",
    name: "Análisis visual con IA",
    shortName: "Visual",
    icon: "eye",
    description:
      "Evalúa piezas gráficas, anuncios e impresos: mapa de atención estimado, recorrido visual, zonas ciegas y métricas de imagen.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/visual`,
  },
  {
    type: "survey",
    category: "perception",
    name: "Encuesta",
    shortName: "Encuesta",
    icon: "survey",
    description:
      "Preguntas propias e instrumentos estandarizados (SUS, NPS, SAM, intención de compra, actitud). El servidor valida y puntúa; los resultados salen con intervalos de confianza y CSV.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/survey`,
  },
  {
    type: "iat_variant",
    category: "association",
    name: "Variantes del IAT (SC-IAT, Go/No-Go, priming)",
    shortName: "Variantes IAT",
    icon: "bolt",
    description:
      "Mide una sola marca sin comparación (SC-IAT) o con una o dos marcas por Go/No-Go y priming evaluativo. El servidor valida los tiempos y puntúa; los resultados traen advertencias de calidad.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/variants`,
  },
  {
    type: "eyetracking",
    category: "attention",
    name: "Eye tracking con webcam",
    shortName: "Eye tracking",
    icon: "eye",
    description:
      "Mide la mirada de participantes sobre hasta 5 imágenes o un video (MP4/WebM) con Facial Coding opcional. Incluye calibración, controles de calidad, AOIs dinámicas y mapas de atención con webcam.",
    newStudyPath: (projectId) =>
      `/projects/${projectId}/studies/new/eyetracking`,
  },
];

export function getTool(type: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.type === type);
}

/** Los estudios de webcam existentes comparten almacenamiento de imágenes con Visual. */
export function getStudyTool(study: {
  tool_type: string;
  config: unknown;
}): ToolDefinition | undefined {
  const config = study.config;
  const eye =
    study.tool_type === "visual" &&
    typeof config === "object" &&
    config !== null &&
    "mode" in config &&
    config.mode === "pieces" &&
    "eyeTracking" in config &&
    Boolean(config.eyeTracking);
  return getTool(eye ? "eyetracking" : study.tool_type);
}
