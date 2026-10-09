import type { IatConfig } from "../config";
import type { ResultRow } from "./views";

export const STRENGTH_LABEL = {
  none: "Sin preferencia clara",
  slight: "Leve",
  moderate: "Moderada",
  strong: "Fuerte",
} as const;

export const FLAG_LABEL: Record<string, string> = {
  high_error_rate: "Tasa de error > 30 %",
  fast_responses: "> 10 % de respuestas < 300 ms",
  insufficient_data: "Datos insuficientes para calcular D",
};

/** "Moderada · Marca A más asociada a «Confiable»" (D > 0 ⇒ A con el polo positivo). */
export function interpretationText(config: IatConfig, dimensionIdx: number, r: ResultRow | null): string {
  if (!r || r.d_score === null || !r.strength) return "—";
  if (r.strength === "none") return STRENGTH_LABEL.none;
  const d = config.dimensions[dimensionIdx];
  const who = r.direction === "A" ? config.conceptA.label : config.conceptB.label;
  // D > 0 ⇒ A más asociada al polo positivo; D < 0 ⇒ B más asociada al polo positivo.
  return `${STRENGTH_LABEL[r.strength]} · ${who} más asociada a «${d.positiveLabel}»`;
}

export const validityText = (valid: boolean) => (valid ? "✓ Datos válidos" : "⚠️ Revisar calidad de datos");

export const STATUS_LABEL = { started: "En curso", completed: "Completada", abandoned: "Abandonada" } as const;
export const DEVICE_LABEL = { desktop: "Escritorio", mobile: "Celular", tablet: "Tableta", unknown: "—" } as const;
