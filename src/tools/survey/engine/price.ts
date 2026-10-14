/**
 * Instrumentos de precio: Van Westendorp (medidor de sensibilidad al precio) y Gabor-Granger.
 * Código puro, versionado y con pruebas. Las respuestas son INTENCIÓN DECLARADA: sobreestiman la compra
 * real y estos resultados no son un pronóstico de ventas. La IA nunca recalcula estas cifras.
 */

export const PRICE_ENGINE_VERSION = "nf-price-1.0";

// ---------------------------------------------------------------- Van Westendorp

/** Las cuatro preguntas, en el orden en que se muestran al participante. */
export const VW_QUESTIONS = [
  { key: "tooCheap", text: "¿A qué precio te parecería {subject} tan barato que dudarías de su calidad?" },
  { key: "cheap", text: "¿A qué precio te parecería {subject} una ganga, es decir, barato pero con buena calidad?" },
  { key: "expensive", text: "¿A qué precio te empezaría a parecer caro {subject}, aunque aún lo considerarías?" },
  { key: "tooExpensive", text: "¿A qué precio te parecería {subject} tan caro que no lo comprarías?" },
] as const;

export const PRICE_METHODS = ["van_westendorp", "gabor_granger"] as const;
export type PriceMethod = (typeof PRICE_METHODS)[number];
export const MIN_GG_PRICES = 3;
export const MAX_GG_PRICES = 10;
/** Opciones de respuesta del Gabor-Granger. */
export const GG_YES = "Sí";
export const GG_NO = "No";

export interface VwResponse {
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
}

/** Una respuesta es lógica si tooCheap ≤ cheap ≤ expensive ≤ tooExpensive, todas positivas y finitas. */
export function isLogicalVw(r: VwResponse): boolean {
  const v = [r.tooCheap, r.cheap, r.expensive, r.tooExpensive];
  return v.every((x) => Number.isFinite(x) && x > 0) && r.tooCheap <= r.cheap && r.cheap <= r.expensive && r.expensive <= r.tooExpensive;
}

export interface VwCurvePoint {
  price: number;
  /** «Muy barato»: % que dice que ese precio es tan barato que duda de la calidad (descendente). */
  tooCheap: number;
  /** «No es barato»: % que no lo considera una ganga a ese precio (ascendente). */
  notCheap: number;
  /** «No es caro» (descendente). */
  notExpensive: number;
  /** «Demasiado caro» (ascendente). */
  tooExpensive: number;
}

export interface VwResult {
  /** Respondentes lógicos usados y los excluidos por respuestas incoherentes. */
  n: number;
  nExcluded: number;
  curves: VwCurvePoint[];
  /** Punto de marginalidad en lo barato: «muy barato» × «no es barato». */
  pmc: number | null;
  /** Punto de precio óptimo: «muy barato» × «demasiado caro». */
  opp: number | null;
  /** Punto de indiferencia: «no es barato» × «no es caro». */
  ipp: number | null;
  /** Punto de marginalidad en lo caro: «demasiado caro» × «no es caro». */
  pme: number | null;
  warnings: string[];
}

const MIN_VW = 30;

/** Cruce de dos curvas: primer cambio de signo de (f − g) sobre la rejilla, con interpolación lineal. */
function crossing(prices: number[], f: number[], g: number[]): number | null {
  let prev: number | null = null;
  for (let i = 0; i < prices.length; i++) {
    const d = f[i]! - g[i]!;
    if (Math.abs(d) < 1e-12) return prices[i]!;
    if (prev !== null && Math.sign(prev) !== Math.sign(d)) {
      const t = prev / (prev - d);
      return prices[i - 1]! + t * (prices[i]! - prices[i - 1]!);
    }
    prev = d;
  }
  return null;
}

export function analyzeVanWestendorp(responses: readonly VwResponse[]): VwResult {
  const ok = responses.filter(isLogicalVw);
  const n = ok.length;
  const nExcluded = responses.length - n;
  const warnings: string[] = [];
  if (n === 0) return { n, nExcluded, curves: [], pmc: null, opp: null, ipp: null, pme: null, warnings: ["No hay respuestas válidas."] };
  if (n < MIN_VW) warnings.push(`Con ${n} respuestas válidas las curvas son inestables; se recomiendan al menos ${MIN_VW} (idealmente 100 o más).`);
  if (nExcluded > 0) warnings.push(`${nExcluded} respuesta(s) se excluyeron por incoherentes (no cumplen muy barato ≤ ganga ≤ caro ≤ demasiado caro).`);

  const prices = [...new Set(ok.flatMap((r) => [r.tooCheap, r.cheap, r.expensive, r.tooExpensive]))].sort((a, b) => a - b);
  const share = (pred: (r: VwResponse) => boolean) => ok.filter(pred).length / n;
  const curves: VwCurvePoint[] = prices.map((price) => ({
    price,
    tooCheap: share((r) => r.tooCheap >= price),
    notCheap: share((r) => r.cheap < price),
    notExpensive: 1 - share((r) => r.expensive <= price),
    tooExpensive: share((r) => r.tooExpensive <= price),
  }));
  const col = (k: keyof Omit<VwCurvePoint, "price">) => curves.map((c) => c[k]);
  const pmc = crossing(prices, col("tooCheap"), col("notCheap"));
  const opp = crossing(prices, col("tooCheap"), col("tooExpensive"));
  const ipp = crossing(prices, col("notCheap"), col("notExpensive"));
  const pme = crossing(prices, col("tooExpensive"), col("notExpensive"));
  if (pmc !== null && pme !== null && pmc > pme) warnings.push("El rango aceptable salió invertido (PMC > PME): revisa la muestra o el producto.");
  if ([pmc, opp, ipp, pme].some((x) => x === null)) warnings.push("Alguna intersección no se pudo calcular con estos datos.");
  return { n, nExcluded, curves, pmc, opp, ipp, pme, warnings };
}

// ---------------------------------------------------------------- Gabor-Granger

export interface GgResponse {
  /** Respuesta a cada precio, en el mismo orden que `prices`: true = lo compraría. */
  buys: boolean[];
}

export interface GgPoint {
  price: number;
  n: number;
  /** Proporción que compraría a ese precio. */
  share: number;
  /** Intervalo de Wilson 95 % de la proporción. */
  ci95: [number, number];
  /** Ingreso esperado por persona: precio × proporción. */
  revenue: number;
  /** Utilidad esperada por persona si se indicó costo unitario: (precio − costo) × proporción. */
  profit: number | null;
}

export interface GgResult {
  n: number;
  /** Respuestas no monótonas (sí a un precio mayor y no a uno menor) excluidas del cálculo. */
  nInconsistent: number;
  points: GgPoint[];
  /** Precio que maximiza el ingreso (o la utilidad, si hay costo) entre los precios probados. */
  optimalPrice: number | null;
  warnings: string[];
}

function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** ¿La demanda de esta persona es monótona (si compra a un precio, compra a todos los menores)? */
export function isMonotoneGg(prices: readonly number[], buys: readonly boolean[]): boolean {
  const order = prices.map((p, i) => ({ p, b: buys[i]! })).sort((a, b) => a.p - b.p);
  let seenNo = false;
  for (const o of order) {
    if (!o.b) seenNo = true;
    else if (seenNo) return false;
  }
  return true;
}

export function analyzeGaborGranger(prices: readonly number[], responses: readonly GgResponse[], unitCost?: number): GgResult {
  const warnings: string[] = [];
  const valid = responses.filter((r) => r.buys.length === prices.length);
  const monotone = valid.filter((r) => isMonotoneGg(prices, r.buys));
  const nInconsistent = valid.length - monotone.length;
  const n = monotone.length;
  if (nInconsistent > 0) warnings.push(`${nInconsistent} respuesta(s) se excluyeron por incoherentes (dicen sí a un precio mayor y no a uno menor).`);
  if (n === 0) return { n, nInconsistent, points: [], optimalPrice: null, warnings: [...warnings, "No hay respuestas válidas."] };
  if (n < 30) warnings.push(`Con ${n} respuestas válidas la curva de demanda es muy imprecisa; revisa los intervalos.`);

  const order = prices.map((price, index) => ({ price, index })).sort((a, b) => a.price - b.price);
  const points: GgPoint[] = order.map(({ price, index }) => {
    const k = monotone.filter((r) => r.buys[index]).length;
    const s = k / n;
    return {
      price,
      n,
      share: s,
      ci95: wilson(k, n),
      revenue: price * s,
      profit: unitCost !== undefined ? (price - unitCost) * s : null,
    };
  });
  const key = (p: GgPoint) => (p.profit !== null ? p.profit : p.revenue);
  const best = points.reduce((a, b) => (key(b) > key(a) ? b : a));
  warnings.push("La intención declarada sobreestima la compra real: úsala para comparar precios, no como pronóstico de ventas.");
  return { n, nInconsistent, points, optimalPrice: key(best) > 0 ? best.price : null, warnings };
}
