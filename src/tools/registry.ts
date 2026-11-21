/**
 * Registro de herramientas de investigación. Un proyecto puede contener
 * estudios de distintas herramientas.
 */
import type { IconName } from "@/components/brand/icon";

import type { EvidenceKind } from "@/components/ui/evidence-badge";

export type ToolType =
  "iat" | "seo" | "visual" | "web_visual" | "web_eyetracking" | "survey" | "iat_variant" | "eyetracking";

export const TOOL_CATEGORIES = [
  { id: "attention", name: "Atención visual", question: "¿Qué miran?" },
  {
    id: "association",
    name: "Asociaciones implícitas",
    question: "¿Qué asocian?",
  },
  {
    id: "digital",
    name: "Diagnóstico digital",
    question: "¿Cómo funciona tu sitio?",
  },
  { id: "perception", name: "Percepción y opinión", question: "¿Qué opinan?" },
] as const;

export interface ToolDefinition {
  type: ToolType;
  category: (typeof TOOL_CATEGORIES)[number]["id"];
  name: string;
  shortName: string;
  icon: IconName;
  evidence: EvidenceKind;
  modality: string;
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
    evidence: "measured",
    modality: "Liga para participantes",
    description:
      "Compara dos marcas u opciones midiendo qué atributos asocian más rápido las personas.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/iat`,
  },
  {
    type: "seo",
    category: "digital",
    name: "Auditoría SEO",
    shortName: "SEO",
    icon: "search",
    evidence: "modeled",
    modality: "Análisis inmediato",
    description:
      "Revisa una URL o archivo HTML para detectar fallos de indexación, velocidad y contenido.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/seo`,
  },
  {
    type: "web_visual",
    category: "digital",
    name: "Análisis de Imagen Web",
    shortName: "Imagen Web",
    icon: "eye",
    evidence: "estimated",
    modality: "Análisis inmediato",
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
    evidence: "measured",
    modality: "Requiere participantes y webcam",
    description:
      "Mide la mirada real de participantes en tu sitio web mediante snippet en el <head> o con capturas web sin código, guiados por pasos e instrucciones.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/web-eyetracking`,
  },
  {
    type: "visual",
    category: "attention",
    name: "Análisis visual con IA",
    shortName: "Visual",
    icon: "eye",
    evidence: "estimated",
    modality: "Análisis inmediato",
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
    evidence: "measured",
    modality: "Liga para participantes",
    description:
      "Combina preguntas propias con escalas validadas de usabilidad, satisfacción e intención de compra.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/survey`,
  },
  {
    type: "iat_variant",
    category: "association",
    name: "Variantes del IAT (SC-IAT, Go/No-Go, priming)",
    shortName: "Variantes IAT",
    icon: "bolt",
    evidence: "measured",
    modality: "Liga para participantes",
    description:
      "Evalúa una sola marca o prueba reacciones rápidas sin necesidad de compararla contra otra.",
    newStudyPath: (projectId) => `/projects/${projectId}/studies/new/variants`,
  },
  {
    type: "eyetracking",
    category: "attention",
    name: "Eye tracking con webcam",
    shortName: "Eye tracking",
    icon: "eye",
    evidence: "measured",
    modality: "Requiere participantes y webcam",
    description:
      "Registra la mirada real de participantes sobre imágenes o video con calibración y control de calidad.",
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
