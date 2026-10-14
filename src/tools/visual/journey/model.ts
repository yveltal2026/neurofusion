/**
 * Modelo de journey e IFD (motor nf-journey-1.0). Puerto en TypeScript de simulate.py +
 * benchmark.py de NeuroSEO, con estas correcciones:
 *  - D-05: tareas parametrizadas por TIPO (no por id fijo T1–T5); cualquier número de tareas.
 *  - D-06: la semilla siempre es explícita y reproducible.
 *  - D-07: relevancia_resultados, claridad_msi y arquitectura_nav ahora influyen (pesos provisionales).
 *  - Números aleatorios comunes: cada sujeto consume SIEMPRE la misma cantidad de números
 *    (también el de abandono), así las diferencias entre sitios sólo reflejan las calificaciones.
 *  - Panel modelado grande (N = 5000 por defecto): el ruido de simulación es despreciable y no se
 *    presenta como "margen de error" poblacional; lo que manda son las calificaciones del analista.
 * La fórmula del IFD (ifd-1.0) es idéntica a la original.
 */
import { AGE_GROUPS, LITERACY, type AgeGroup, type Literacy, type Quotas } from "./calibration";
import { createRng, shuffleInPlace, type SimRng } from "./rng";

export const ENGINE_VERSION = "nf-journey-1.0";
export const IFD_VERSION = "ifd-1.0";
export const DEFAULT_PANEL_N = 5000;

export const TASK_KINDS = ["busqueda", "resultados", "ficha", "carrito", "categorias", "otra"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type FrictionKey =
  | "login_obligatorio_carrito"
  | "resenas_visibles"
  | "relevancia_resultados"
  | "claridad_ficha"
  | "claridad_msi"
  | "arquitectura_nav"
  | "confianza_vendedor";

export const FRICTION_KEYS: FrictionKey[] = [
  "login_obligatorio_carrito",
  "resenas_visibles",
  "relevancia_resultados",
  "claridad_ficha",
  "claridad_msi",
  "arquitectura_nav",
  "confianza_vendedor",
];

interface KindDef {
  label: string;
  /** Coeficiente de alfabetización digital (0.09 en general; 0.10 en carrito, como el original). */
  literacy: number;
  /** Fricciones que suman a la probabilidad de éxito de la tarea. */
  frictions: Partial<Record<FrictionKey, number>>;
}

export const TASK_KIND_DEFS: Record<TaskKind, KindDef> = {
  busqueda: { label: "Búsqueda", literacy: 0.09, frictions: { relevancia_resultados: 0.05 } },
  resultados: { label: "Resultados", literacy: 0.09, frictions: { resenas_visibles: 0.06 } },
  ficha: { label: "Ficha de producto", literacy: 0.09, frictions: { claridad_ficha: 0.05 } },
  carrito: { label: "Carrito / pago", literacy: 0.1, frictions: { claridad_msi: 0.04 } },
  categorias: { label: "Navegación por categorías", literacy: 0.09, frictions: { arquitectura_nav: 0.06 } },
  otra: { label: "Otra", literacy: 0.09, frictions: {} },
};

const AGE_IDX: Record<AgeGroup, number> = { "18-24": 0, "25-34": 1, "35-44": 2, "45-54": 3, "55-64": 4, "65+": 5 };
const LD: Record<Literacy, number> = { Alta: 2, Media: 1, Baja: 0 };

export interface Subject {
  age: AgeGroup;
  literacy: Literacy;
}

export interface TaskInput {
  id: string;
  name: string;
  kind: TaskKind;
}

/** Calificaciones de un sitio: fricciones 0–1, login 0/1 y base de éxito por tarea. */
export interface SiteRatings {
  frictions: Record<FrictionKey, number>;
  baseSuccess: Record<string, number>;
}

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Reparte n entre grupos según % con el método del mayor residuo. */
export function allocate<K extends string>(shares: Record<K, number>, n: number): Record<K, number> {
  const keys = Object.keys(shares) as K[];
  const total = keys.reduce((a, k) => a + shares[k], 0);
  const raw = keys.map((k) => ({ k, v: (shares[k] / total) * n }));
  const out = Object.fromEntries(raw.map(({ k, v }) => [k, Math.floor(v)])) as Record<K, number>;
  let left = n - keys.reduce((a, k) => a + out[k], 0);
  for (const { k } of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) {
    if (left-- <= 0) break;
    out[k]++;
  }
  return out;
}

/** Panel por cuotas. Edad y alfabetización se barajan por separado (sin cuotas cruzadas). */
export function generatePanel(quotas: Quotas, n: number, seed: number): Subject[] {
  const rng = createRng(seed ^ 0x5eed);
  const expand = <K extends string>(alloc: Record<K, number>) => (Object.keys(alloc) as K[]).flatMap((k) => Array<K>(alloc[k]).fill(k));
  const ages = shuffleInPlace(expand(allocate(quotas.age, n)), rng);
  const lits = shuffleInPlace(expand(allocate(quotas.literacy, n)), rng);
  return ages.map((age, i) => ({ age, literacy: lits[i] }));
}

export interface SubjectResult {
  success: number[];
  times: number[];
  abandon: boolean;
  trust: number;
  sus: number;
  load: number;
}

export function simulateSubject(s: Subject, r: SiteRatings, tasks: TaskInput[], rng: SimRng): SubjectResult {
  const ld = LD[s.literacy];
  const e = AGE_IDX[s.age];
  const f = r.frictions;
  const success: number[] = [];
  const times: number[] = [];
  let cartFailed = false;
  tasks.forEach((t, idx) => {
    const def = TASK_KIND_DEFS[t.kind];
    let p = (r.baseSuccess[t.id] ?? 0.5) + def.literacy * ld - 0.03 * e;
    for (const [k, w] of Object.entries(def.frictions) as [FrictionKey, number][]) p += w * f[k];
    const ok = rng.random() < clip(p, 0.04, 0.97) ? 1 : 0;
    success.push(ok);
    times.push(clip(rng.normal(40 + 12 * idx - 6 * ld, 12), 15, 200));
    if (t.kind === "carrito" && !ok) cartFailed = true;
  });
  // Siempre se consume el número de abandono (alineación de números aleatorios entre sitios).
  const uAbandon = rng.random();
  const abandon = f.login_obligatorio_carrito >= 0.5 && cartFailed && uAbandon < 0.75;
  // Éxitos reescalados a 5 tareas para conservar los coeficientes originales de SUS y carga.
  const k = (success.reduce((a, b) => a + b, 0) * 5) / Math.max(1, tasks.length);
  const trust = clip(rng.normal(1.6 + 2.6 * f.confianza_vendedor + 0.5 * f.resenas_visibles, 0.55), 1, 5);
  const sus = clip(rng.normal(37 + 5.2 * k + 4 * ld + 6 * f.arquitectura_nav, 6), 20, 96);
  const load = clip(rng.normal(5.6 - 0.5 * ld - 0.35 * k - 1.0 * f.arquitectura_nav, 0.7), 1, 7);
  return { success, times, abandon, trust, sus, load };
}

export interface SegmentRow {
  group: string;
  n: number;
  successAvg: number;
  sus: number;
}

export interface SiteSummary {
  n: number;
  successByTask: Record<string, number>;
  timeByTask: Record<string, number>;
  successAvg: number;
  abandonPct: number;
  trustAvg: number;
  susAvg: number;
  loadAvg: number;
  byAge: SegmentRow[];
  byLiteracy: SegmentRow[];
  /** Ruido de la simulación (IC 95 % de un % con n sujetos). NO es un margen de error poblacional. */
  simulationNoisePts: number;
  alerts: string[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarizeSite(panel: Subject[], results: SubjectResult[], tasks: TaskInput[]): SiteSummary {
  const n = results.length;
  const successByTask: Record<string, number> = {};
  const timeByTask: Record<string, number> = {};
  tasks.forEach((t, i) => {
    successByTask[t.id] = r1(100 * mean(results.map((r) => r.success[i])));
    timeByTask[t.id] = r1(mean(results.map((r) => r.times[i])));
  });
  const rowSuccess = (r: SubjectResult) => (100 * mean(r.success));

  const seg = <G extends string>(groups: readonly G[], pick: (s: Subject) => G): SegmentRow[] =>
    groups
      .map((g) => {
        const idx = panel.map((s, i) => (pick(s) === g ? i : -1)).filter((i) => i >= 0);
        return { group: g, n: idx.length, successAvg: r1(mean(idx.map((i) => rowSuccess(results[i])))), sus: r1(mean(idx.map((i) => results[i].sus))) };
      })
      .filter((x) => x.n > 0);

  const byAge = seg(AGE_GROUPS, (s) => s.age);
  const byLiteracy = seg(LITERACY, (s) => s.literacy);

  // QA de coherencia (validar_coherencia de NeuroSEO, generalizado).
  const alerts: string[] = [];
  const cartIdx = tasks.findIndex((t) => t.kind === "carrito");
  if (cartIdx >= 0) {
    const rate = (lit: Literacy) => {
      const idx = panel.map((s, i) => (s.literacy === lit ? i : -1)).filter((i) => i >= 0);
      return idx.length ? mean(idx.map((i) => results[i].success[cartIdx])) : null;
    };
    const hi = rate("Alta"), lo = rate("Baja");
    if (hi !== null && lo !== null && hi < lo) alerts.push("Incoherencia: en carrito, la alfabetización digital alta tiene menos éxito que la baja.");
  }
  const susOf = (groups: AgeGroup[]) => {
    const idx = panel.map((s, i) => (groups.includes(s.age) ? i : -1)).filter((i) => i >= 0);
    return idx.length ? mean(idx.map((i) => results[i].sus)) : null;
  };
  const young = susOf(["18-24", "25-34"]), old = susOf(["55-64", "65+"]);
  if (young !== null && old !== null && young < old - 2) alerts.push("Incoherencia: el SUS de 18–34 años es menor que el de 55+ años.");

  return {
    n,
    successByTask,
    timeByTask,
    successAvg: r1(mean(Object.values(successByTask))),
    abandonPct: r1(100 * mean(results.map((r) => (r.abandon ? 1 : 0)))),
    trustAvg: r2(mean(results.map((r) => r.trust))),
    susAvg: r1(mean(results.map((r) => r.sus))),
    loadAvg: r2(mean(results.map((r) => r.load))),
    byAge,
    byLiteracy,
    simulationNoisePts: r1(1.96 * Math.sqrt(0.25 / Math.max(1, n)) * 100),
    alerts,
  };
}

export type IfdReading = "baja" | "media" | "alta" | "crítica";

export interface IfdResult {
  version: string;
  score: number;
  ifd: number;
  reading: IfdReading;
}

/** IFD ifd-1.0 (idéntico a NeuroSEO): 100 − score de experiencia ponderado. Menor = mejor. */
export function computeIfd(s: Pick<SiteSummary, "successAvg" | "susAvg" | "trustAvg" | "abandonPct">): IfdResult {
  const score = 0.35 * s.successAvg + 0.25 * s.susAvg + 0.2 * ((s.trustAvg / 5) * 100) + 0.2 * (100 - s.abandonPct);
  const ifd = r1(100 - score);
  const reading: IfdReading = ifd < 20 ? "baja" : ifd < 35 ? "media" : ifd < 50 ? "alta" : "crítica";
  return { version: IFD_VERSION, score: r1(score), ifd, reading };
}

export function runSite(panel: Subject[], ratings: SiteRatings, tasks: TaskInput[], seed: number) {
  const rng = createRng(seed);
  const results = panel.map((s) => simulateSubject(s, ratings, tasks, rng));
  const summary = summarizeSite(panel, results, tasks);
  return { summary, ifd: computeIfd(summary) };
}

export interface SensitivityRow {
  item: string;
  /** IFD si la calificación baja 0.1 (o login = no). */
  down: number;
  /** IFD si sube 0.1 (o login = sí). */
  up: number;
  base: number;
}

/**
 * Sensibilidad del IFD a cada calificación (±0.1; login se invierte). Muestra qué juicios
 * del analista mueven más el índice: el modelo es una transformación de esas calificaciones.
 */
export function sensitivity(quotas: Quotas, ratings: SiteRatings, tasks: TaskInput[], seed: number, n = 2000): SensitivityRow[] {
  const panel = generatePanel(quotas, n, seed);
  const ifdOf = (r: SiteRatings) => runSite(panel, r, tasks, seed).ifd.ifd;
  const base = ifdOf(ratings);
  const rows: SensitivityRow[] = [];
  for (const k of FRICTION_KEYS) {
    const v = ratings.frictions[k];
    const at = (x: number) => ifdOf({ ...ratings, frictions: { ...ratings.frictions, [k]: x } });
    if (k === "login_obligatorio_carrito") rows.push({ item: k, down: at(0), up: at(1), base });
    else rows.push({ item: k, down: at(clip(v - 0.1, 0, 1)), up: at(clip(v + 0.1, 0, 1)), base });
  }
  for (const t of tasks) {
    const v = ratings.baseSuccess[t.id];
    const at = (x: number) => ifdOf({ ...ratings, baseSuccess: { ...ratings.baseSuccess, [t.id]: x } });
    rows.push({ item: `base_exito.${t.id}`, down: at(clip(v - 0.1, 0.04, 0.97)), up: at(clip(v + 0.1, 0.04, 0.97)), base });
  }
  return rows.sort((a, b) => Math.max(Math.abs(b.up - b.base), Math.abs(b.down - b.base)) - Math.max(Math.abs(a.up - a.base), Math.abs(a.down - a.base)));
}
