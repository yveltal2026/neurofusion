/**
 * Rúbrica de calificación (PROVISIONAL). La rúbrica oficial de FRSKO
 * (docs/RUBRICA_FRICCIONES.md de NeuroSEO) aún no se integra: estas anclas son genéricas
 * y se reemplazarán. Regla de oro que sí se aplica: toda calificación cita evidencia.
 */
import type { JourneyTask } from "../config";
import { TASK_KIND_DEFS, type FrictionKey } from "./model";

export const RUBRIC_VERSION = "rubrica-0.1-provisional";

export interface RubricItem {
  key: string;
  label: string;
  question: string;
  kind: "boolean" | "scale" | "base";
  anchors: { value: number; label: string }[];
  /** Qué parte del modelo mueve esta calificación (transparencia). */
  affects: string;
}

const SCALE = (labels: [string, string, string, string, string]) =>
  [0, 0.25, 0.5, 0.75, 1].map((value, i) => ({ value, label: labels[i] }));

export const FRICTION_ITEMS: Record<FrictionKey, RubricItem> = {
  login_obligatorio_carrito: {
    key: "login_obligatorio_carrito",
    label: "Login obligatorio para comprar",
    question: "¿El sitio exige iniciar sesión o crear cuenta para agregar al carrito o pagar?",
    kind: "boolean",
    anchors: [
      { value: 0, label: "No: permite comprar como invitado" },
      { value: 1, label: "Sí: exige cuenta antes de pagar" },
    ],
    affects: "Abandono en carrito (tiene el mayor peso en el IFD).",
  },
  resenas_visibles: {
    key: "resenas_visibles",
    label: "Reseñas visibles",
    question: "¿Qué tan visibles y útiles son las reseñas/calificaciones en resultados y ficha?",
    kind: "scale",
    anchors: SCALE(["No hay reseñas", "Escasas o escondidas", "Presentes sólo en la ficha", "Visibles con calificación y volumen", "Prominentes en resultados y ficha, con fotos/filtros"]),
    affects: "Éxito en resultados y confianza.",
  },
  relevancia_resultados: {
    key: "relevancia_resultados",
    label: "Relevancia de la búsqueda",
    question: "¿Los resultados de búsqueda corresponden a lo que se buscó?",
    kind: "scale",
    anchors: SCALE(["Resultados irrelevantes o vacíos", "Mayoría irrelevantes", "Mezcla relevante/irrelevante", "Relevantes con algún ruido", "Muy relevantes, con autocompletado y corrección"]),
    affects: "Éxito en búsqueda.",
  },
  claridad_ficha: {
    key: "claridad_ficha",
    label: "Claridad de la ficha",
    question: "¿La ficha muestra precio, disponibilidad, variantes, envío y CTA de forma clara?",
    kind: "scale",
    anchors: SCALE(["Faltan datos clave o no hay CTA visible", "Datos dispersos, CTA débil", "Completa pero desordenada", "Clara con detalles menores", "Ejemplar: todo visible sin desplazarse"]),
    affects: "Éxito en ficha de producto.",
  },
  claridad_msi: {
    key: "claridad_msi",
    label: "Claridad de pago y MSI",
    question: "¿Los meses sin intereses, costos de envío y métodos de pago se entienden antes de pagar?",
    kind: "scale",
    anchors: SCALE(["Costos ocultos hasta el final", "Información confusa", "Información presente pero tardía", "Clara en carrito", "Clara desde la ficha"]),
    affects: "Éxito en carrito.",
  },
  arquitectura_nav: {
    key: "arquitectura_nav",
    label: "Arquitectura de navegación",
    question: "¿El menú y las categorías permiten llegar al producto sin buscar?",
    kind: "scale",
    anchors: SCALE(["Menú caótico o roto", "Categorías poco intuitivas", "Funcional con fricciones", "Clara con detalles", "Excelente: rutas obvias y filtros útiles"]),
    affects: "Éxito en categorías, SUS y carga cognitiva.",
  },
  confianza_vendedor: {
    key: "confianza_vendedor",
    label: "Señales de confianza",
    question: "¿Hay señales de confianza (vendedor identificado, políticas, sellos, contacto, pago seguro)?",
    kind: "scale",
    anchors: SCALE(["Ninguna señal", "Pocas y poco visibles", "Básicas", "Buenas y visibles", "Sobresalientes"]),
    affects: "Confianza declarada.",
  },
};

export const BASE_ANCHORS = [
  { value: 0.95, label: "Trivial: sin fricción" },
  { value: 0.8, label: "Fricción menor" },
  { value: 0.6, label: "Fricción moderada" },
  { value: 0.4, label: "Fricción severa" },
  { value: 0.2, label: "Casi bloqueante" },
];

export function baseItem(task: JourneyTask): RubricItem {
  return {
    key: `base_exito.${task.id}`,
    label: `Éxito base · ${task.id} ${task.name}`,
    question: `Sin considerar al usuario, ¿qué tan probable es completar «${task.instruction}»? (${TASK_KIND_DEFS[task.kind].label})`,
    kind: "base",
    anchors: BASE_ANCHORS,
    affects: "Probabilidad de éxito de la tarea (determina casi todo su resultado).",
  };
}

/** Todos los ítems que el analista debe calificar por sitio. */
export function rubricItems(tasks: JourneyTask[]): RubricItem[] {
  return [...Object.values(FRICTION_ITEMS), ...tasks.map(baseItem)];
}
