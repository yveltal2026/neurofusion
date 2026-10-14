import type { Category, Severity } from "./types";

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  high: "Grave",
  medium: "Mejorable",
  ok: "Correcto",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  rastreo: "Rastreo",
  indexacion: "Indexación",
  contenido: "Contenido",
  estructura: "Estructura",
  datos_estructurados: "Datos estructurados",
  social: "Social",
  imagenes: "Imágenes",
  enlaces: "Enlaces",
  internacional: "Internacional",
  movil: "Móvil",
  rendimiento: "Rendimiento",
  seguridad: "Seguridad",
};
