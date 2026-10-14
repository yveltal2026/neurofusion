/**
 * Tamaño de muestra y efecto mínimo detectable. Código puro, sin I/O.
 *
 * Usa la aproximación normal con la corrección de Guenther para pruebas t
 * (suma z²/2 en una muestra, z²/4 por grupo en dos), que queda a ±1 de G*Power.
 * Son guías de planeación, no garantías: suponen datos aproximadamente normales,
 * una sola prueba principal y respuesta completa.
 */

/** Cuantil de la normal estándar (Acklam, error relativo < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p debe estar en (0, 1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

export interface TestParams {
  /** Nivel de significancia de dos colas. Por defecto 0.05. */
  alpha?: number;
  /** Potencia deseada. Por defecto 0.8. */
  power?: number;
}

const zAlpha = (alpha: number) => normalQuantile(1 - alpha / 2);
const zPower = (power: number) => normalQuantile(power);

function check(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} debe ser un número positivo`);
}

/** Participantes para detectar un efecto d de Cohen contra cero (una muestra, p. ej. D del IAT ≠ 0). */
export function nOneSample(d: number, { alpha = 0.05, power = 0.8 }: TestParams = {}): number {
  check(d, "d");
  const za = zAlpha(alpha);
  return Math.ceil(((za + zPower(power)) / d) ** 2 + (za * za) / 2);
}

/** Participantes POR GRUPO para detectar una diferencia d de Cohen entre dos grupos independientes (p. ej. prueba A/B). */
export function nTwoMeans(d: number, { alpha = 0.05, power = 0.8 }: TestParams = {}): number {
  check(d, "d");
  const za = zAlpha(alpha);
  return Math.ceil(2 * ((za + zPower(power)) / d) ** 2 + (za * za) / 4);
}

/** Efecto d mínimo detectable con n participantes (una muestra). Devuelve null si n es demasiado pequeño. */
export function detectableEffectOneSample(n: number, { alpha = 0.05, power = 0.8 }: TestParams = {}): number | null {
  const za = zAlpha(alpha);
  const eff = n - (za * za) / 2;
  if (!(eff > 0)) return null;
  return (za + zPower(power)) / Math.sqrt(eff);
}

/** Efecto d mínimo detectable con n participantes POR GRUPO (dos grupos). */
export function detectableEffectTwoMeans(nPerGroup: number, { alpha = 0.05, power = 0.8 }: TestParams = {}): number | null {
  const za = zAlpha(alpha);
  const eff = nPerGroup - (za * za) / 4;
  if (!(eff > 0)) return null;
  return (za + zPower(power)) * Math.sqrt(2 / eff);
}

/**
 * Participantes para estimar una proporción (p. ej. % de promotores) con un margen de error.
 * `p` = proporción esperada (0.5 es el caso más conservador). Con `population` aplica la corrección por población finita.
 */
export function nProportion({ p = 0.5, margin, confidence = 0.95, population }: { p?: number; margin: number; confidence?: number; population?: number }): number {
  check(margin, "margen");
  if (!(p > 0 && p < 1)) throw new RangeError("p debe estar en (0, 1)");
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const n0 = (z * z * p * (1 - p)) / (margin * margin);
  if (population === undefined) return Math.ceil(n0);
  check(population, "población");
  return Math.ceil(n0 / (1 + (n0 - 1) / population));
}

/** Margen de error (±) de una proporción con n participantes. */
export function marginOfError(n: number, { p = 0.5, confidence = 0.95 }: { p?: number; confidence?: number } = {}): number {
  check(n, "n");
  const z = normalQuantile(1 - (1 - confidence) / 2);
  return z * Math.sqrt((p * (1 - p)) / n);
}

/** Etiqueta cualitativa del tamaño de un efecto d de Cohen (convención de Cohen, 1988). */
export function effectLabel(d: number): "pequeño" | "mediano" | "grande" | "muy pequeño" {
  if (d >= 0.8) return "grande";
  if (d >= 0.5) return "mediano";
  if (d >= 0.2) return "pequeño";
  return "muy pequeño";
}

/** Desviación típica de D que se asume por defecto al pasar de «D medio» a d de Cohen en el IAT (valor orientativo). */
export const IAT_ASSUMED_SD = 0.4;
