export type ScreenFormat = "auto" | "16:9" | "16:10" | "4:3" | "21:9" | "32:9";

/** La diagonal es física; el formato corresponde a toda la pantalla, no a la ventana. */
export function screenWidthCm(diagonalInches: number, format: ScreenFormat, widthPx: number, heightPx: number): number {
  const ratio = format === "auto" ? widthPx / heightPx : (() => {
    const [w, h] = format.split(":").map(Number);
    return widthPx >= heightPx ? w / h : h / w;
  })();
  if (!Number.isFinite(diagonalInches) || diagonalInches < 3 || diagonalInches > 100 || !Number.isFinite(ratio) || ratio <= 0) return NaN;
  return diagonalInches * 2.54 * ratio / Math.hypot(ratio, 1);
}
