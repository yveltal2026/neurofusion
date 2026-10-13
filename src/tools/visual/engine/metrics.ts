/**
 * Métricas deterministas de imagen (código puro sobre píxeles RGB/RGBA).
 * Son mediciones verificables, a diferencia de la lectura de la IA.
 */

export const METRICS_VERSION = "nf-img-1.0";

export interface RawImage {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface ImageMetrics {
  version: string;
  /** Luminancia relativa media (WCAG, 0–1). */
  meanLuminance: number;
  /** Contraste RMS: desviación estándar de la luminancia (0–0.5). */
  rmsContrast: number;
  /** Colorido de Hasler & Süsstrunk (0 ≈ gris; > 80 muy colorido). */
  colorfulness: number;
  /** Fracción de píxeles con bordes fuertes (Sobel): proxy de saturación visual. */
  edgeDensity: number;
  /** Fracción de bloques casi uniformes: espacio negativo. */
  negativeSpace: number;
  /** Colores dominantes (cuantizados) con su proporción. */
  palette: { hex: string; share: number }[];
}

const srgbToLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const LIN = Array.from({ length: 256 }, (_, i) => srgbToLinear(i));

/** Luminancia relativa WCAG de cada píxel. */
export function luminanceMap(img: RawImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += img.channels) {
    out[i] = 0.2126 * LIN[img.data[p]] + 0.7152 * LIN[img.data[p + 1]] + 0.0722 * LIN[img.data[p + 2]];
  }
  return out;
}

/** Razón de contraste WCAG entre dos luminancias. */
export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function percentile(sorted: Float32Array | number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

export function computeMetrics(img: RawImage): ImageMetrics {
  const { width: w, height: h, channels: ch, data } = img;
  const n = w * h;
  const lum = luminanceMap(img);

  let sum = 0;
  for (let i = 0; i < n; i++) sum += lum[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (lum[i] - mean) ** 2;

  // Colorido (Hasler & Süsstrunk 2003).
  let rgS = 0, rgQ = 0, ybS = 0, ybQ = 0;
  for (let p = 0; p < n * ch; p += ch) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgS += rg; rgQ += rg * rg; ybS += yb; ybQ += yb * yb;
  }
  const rgM = rgS / n, ybM = ybS / n;
  const rgSd = Math.sqrt(Math.max(0, rgQ / n - rgM * rgM));
  const ybSd = Math.sqrt(Math.max(0, ybQ / n - ybM * ybM));
  const colorfulness = Math.sqrt(rgSd ** 2 + ybSd ** 2) + 0.3 * Math.sqrt(rgM ** 2 + ybM ** 2);

  // Sobel sobre luminancia perceptual (0–255 aprox.).
  let edges = 0;
  let inner = 0;
  const L = (x: number, y: number) => lum[y * w + x] * 255;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      if (Math.hypot(gx, gy) > 60) edges++;
      inner++;
    }
  }

  // Espacio negativo: bloques de ~1/32 del lado mayor con luminancia casi constante.
  const bs = Math.max(4, Math.round(Math.max(w, h) / 32));
  let flat = 0;
  let blocks = 0;
  for (let by = 0; by + bs <= h; by += bs) {
    for (let bx = 0; bx + bs <= w; bx += bs) {
      let s = 0, q = 0;
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const v = lum[y * w + x]; s += v; q += v * v; }
      const m = s / (bs * bs);
      if (Math.sqrt(Math.max(0, q / (bs * bs) - m * m)) < 0.02) flat++;
      blocks++;
    }
  }

  // Paleta: cuantización a 3 bits por canal.
  const hist = new Map<number, number>();
  for (let p = 0; p < n * ch; p += ch) {
    const k = ((data[p] >> 5) << 6) | ((data[p + 1] >> 5) << 3) | (data[p + 2] >> 5);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const hex = (v: number) => ((v << 5) + 16).toString(16).padStart(2, "0");
  const palette = [...hist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, c]) => ({ hex: `#${hex(k >> 6)}${hex((k >> 3) & 7)}${hex(k & 7)}`, share: round(c / n, 3) }));

  return {
    version: METRICS_VERSION,
    meanLuminance: round(mean, 3),
    rmsContrast: round(Math.sqrt(sq / n), 3),
    colorfulness: round(colorfulness, 1),
    edgeDensity: inner ? round(edges / inner, 3) : 0,
    negativeSpace: blocks ? round(flat / blocks, 3) : 0,
    palette,
  };
}

/**
 * Contraste estimado dentro de una caja de texto: razón WCAG entre los percentiles 10 y 90
 * de luminancia (aprox. fondo vs. letra). Es una estimación: no segmenta el texto.
 */
export function estimateTextContrast(img: RawImage, box: [number, number, number, number]): number | null {
  const lum = luminanceMap(img);
  const x0 = Math.max(0, Math.floor(box[0] * img.width));
  const y0 = Math.max(0, Math.floor(box[1] * img.height));
  const x1 = Math.min(img.width, Math.ceil(box[2] * img.width));
  const y1 = Math.min(img.height, Math.ceil(box[3] * img.height));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const vals: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) vals.push(lum[y * img.width + x]);
  vals.sort((a, b) => a - b);
  return round(contrastRatio(percentile(vals, 0.9), percentile(vals, 0.1)), 2);
}

export function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Lectura cualitativa para la UI (umbrales heurísticos, documentados). */
export function describeMetrics(m: ImageMetrics) {
  return {
    contrast: m.rmsContrast < 0.12 ? "bajo" : m.rmsContrast < 0.25 ? "medio" : "alto",
    clutter: m.edgeDensity < 0.06 ? "limpia" : m.edgeDensity < 0.14 ? "moderada" : "saturada",
    colorfulness: m.colorfulness < 15 ? "apagado" : m.colorfulness < 45 ? "moderado" : m.colorfulness < 80 ? "colorido" : "muy colorido",
  };
}
