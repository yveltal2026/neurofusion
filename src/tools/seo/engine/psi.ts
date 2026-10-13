import { finding } from "./rules";
import type { Finding, PerformanceResult } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/** Extrae lo necesario de una respuesta de PageSpeed Insights v5. */
export function parsePsi(json: unknown, strategy: "mobile" | "desktop"): PerformanceResult {
  const root = obj(json);
  const lh = obj(root.lighthouseResult);
  const audits = obj(lh.audits);
  const audit = (id: string) => num(obj(audits[id]).numericValue);
  const score = num(obj(obj(lh.categories).performance).score);

  const le = obj(root.loadingExperience);
  const metrics = obj(le.metrics);
  const pct = (k: string) => num(obj(metrics[k]).percentile);
  const hasField = Object.keys(metrics).length > 0;
  const clsField = pct("CUMULATIVE_LAYOUT_SHIFT_SCORE");

  const opportunities = Object.entries(audits)
    .map(([id, a]) => {
      const o = obj(a);
      const d = obj(o.details);
      const savings = num(d.overallSavingsMs);
      return d.type === "opportunity" && savings && savings > 0 ? { id, title: String(o.title ?? id), savingsMs: Math.round(savings) } : null;
    })
    .filter((x): x is { id: string; title: string; savingsMs: number } => x !== null)
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 8);

  return {
    strategy,
    url: String(lh.finalDisplayedUrl ?? lh.finalUrl ?? root.id ?? ""),
    performanceScore: score === null ? null : Math.round(score * 100),
    lab: {
      lcpMs: audit("largest-contentful-paint"),
      cls: audit("cumulative-layout-shift"),
      tbtMs: audit("total-blocking-time"),
      fcpMs: audit("first-contentful-paint"),
      speedIndexMs: audit("speed-index"),
    },
    field: hasField
      ? {
          lcpMs: pct("LARGEST_CONTENTFUL_PAINT_MS"),
          // CrUX expresa el CLS ×100.
          cls: clsField === null ? null : clsField / 100,
          inpMs: pct("INTERACTION_TO_NEXT_PAINT"),
          category: typeof le.overall_category === "string" ? le.overall_category : null,
        }
      : null,
    opportunities,
  };
}

/** Umbrales oficiales de Core Web Vitals (bueno / pobre). */
const CWV = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
};

function grade(v: number, t: { good: number; poor: number }) {
  return v <= t.good ? "ok" : v > t.poor ? "high" : "medium";
}

/** Hallazgos de rendimiento. Prefiere datos de campo (usuarios reales) sobre laboratorio. */
export function auditPerformance(p: PerformanceResult): Finding[] {
  const out: Finding[] = [];
  const src = (field: boolean) => (field ? "usuarios reales (CrUX, p75)" : "laboratorio (Lighthouse)");
  if (p.performanceScore !== null) {
    const s = p.performanceScore;
    out.push(finding("perf.score", s >= 90 ? "ok" : s >= 50 ? "medium" : "high", `Puntuación de rendimiento ${s}/100 (${p.strategy === "mobile" ? "móvil" : "escritorio"}).`, p.url));
  }
  const lcp = p.field?.lcpMs ?? p.lab.lcpMs;
  if (lcp !== null) out.push(finding("perf.lcp", grade(lcp, CWV.lcp), `LCP ${(lcp / 1000).toFixed(1)} s · ${src(p.field?.lcpMs != null)}.`, p.url));
  const cls = p.field?.cls ?? p.lab.cls;
  if (cls !== null) out.push(finding("perf.cls", grade(cls, CWV.cls), `CLS ${cls.toFixed(2)} · ${src(p.field?.cls != null)}.`, p.url));
  const inp = p.field?.inpMs ?? null;
  if (inp !== null) out.push(finding("perf.inp", grade(inp, CWV.inp), `INP ${Math.round(inp)} ms · ${src(true)}.`, p.url));
  return out;
}
