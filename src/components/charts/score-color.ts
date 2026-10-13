/**
 * Banda de una puntuación 0–100 con los tokens de estado de la marca (pasan contraste en
 * claro y oscuro). El color siempre va acompañado de la etiqueta de texto. Módulo neutro:
 * se usa desde componentes de servidor y de cliente.
 */
export function scoreBand(s: number): { label: string; color: string } {
  if (s >= 85) return { label: "Bueno", color: "var(--success)" };
  if (s >= 60) return { label: "Regular", color: "var(--warning)" };
  return { label: "Bajo", color: "var(--danger)" };
}

export const scoreColor = (s: number) => scoreBand(s).color;
