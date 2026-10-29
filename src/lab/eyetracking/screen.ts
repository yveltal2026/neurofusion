export type ScreenFormat = "auto" | "16:9" | "16:10" | "4:3" | "21:9" | "32:9";

/** Lado corto de una tarjeta estándar ID-1, en centímetros. */
export const REFERENCE_CARD_WIDTH_CM = 5.398;

/** Convierte una referencia ajustada en píxeles CSS al ancho físico de la pantalla. */
export function screenWidthFromReference(referenceWidthPx: number, screenWidthPx: number): number {
  if (!Number.isFinite(referenceWidthPx) || referenceWidthPx <= 0 || !Number.isFinite(screenWidthPx) || screenWidthPx <= 0) return NaN;
  return screenWidthPx * REFERENCE_CARD_WIDTH_CM / referenceWidthPx;
}

/** La diagonal es física; el formato corresponde a toda la pantalla, no a la ventana. */
export function screenWidthCm(diagonalInches: number, format: ScreenFormat, widthPx: number, heightPx: number): number {
  const ratio = format === "auto" ? widthPx / heightPx : (() => {
    const [w, h] = format.split(":").map(Number);
    return widthPx >= heightPx ? w / h : h / w;
  })();
  if (!Number.isFinite(diagonalInches) || diagonalInches < 3 || diagonalInches > 100 || !Number.isFinite(ratio) || ratio <= 0) return NaN;
  return diagonalInches * 2.54 * ratio / Math.hypot(ratio, 1);
}
