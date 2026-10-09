/** Utilidades estadísticas puras (sin dependencias). */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Desviación estándar muestral (n − 1). NaN si n < 2. */
export function sampleSd(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / (n - 1));
}

// --- Distribución t de Student -------------------------------------------

function lgamma(x: number): number {
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const xx = x - 1;
  let a = coef[0];
  const t = xx + 7.5;
  for (let i = 1; i < coef.length; i++) a += coef[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fracción continua de la beta incompleta (Lentz modificado). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * regIncBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

/** p-valor de dos colas para un estadístico t con `df` grados de libertad. */
export function tTwoSidedP(t: number, df: number): number {
  return regIncBeta(df / (df + t * t), df / 2, 0.5);
}

/** Cuantil de la t de Student por bisección (suficiente para IC95 %). */
export function tQuantile(p: number, df: number): number {
  if (p <= 0 || p >= 1) return NaN;
  if (p === 0.5) return 0;
  let lo = -1e3;
  let hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface OneSampleTest {
  n: number;
  mean: number;
  sd: number;
  se: number;
  t: number;
  df: number;
  p: number;
  ci95: [number, number];
  /** d de Cohen para una muestra contra 0: media / SD. */
  cohenD: number;
}

/** t de una muestra contra 0. Devuelve null si n < 2 o SD = 0. */
export function oneSampleTTest(xs: readonly number[]): OneSampleTest | null {
  const n = xs.length;
  if (n < 2) return null;
  const m = mean(xs);
  const sd = sampleSd(xs);
  if (!(sd > 0)) return null;
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const t = m / se;
  const crit = tQuantile(0.975, df);
  return {
    n,
    mean: m,
    sd,
    se,
    t,
    df,
    p: tTwoSidedP(t, df),
    ci95: [m - crit * se, m + crit * se],
    cohenD: m / sd,
  };
}
