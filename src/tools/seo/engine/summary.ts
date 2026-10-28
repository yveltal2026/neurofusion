import { RULES, ruleDef } from "./rules-catalog";
import type {
  AuditSummary,
  Category,
  Finding,
  Severity,
  SeverityCounts,
} from "./types";

export const SCORE_VERSION = "seo-score-1.1";

const RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  ok: 0,
};
const CREDIT: Record<Severity, number> = {
  ok: 1,
  medium: 0.5,
  high: 0.25,
  critical: 0,
};

/**
 * Una regla por URL: si dos fuentes evalúan lo mismo (p. ej. noindex en meta y en cabecera),
 * gana la más grave. Los hallazgos de sitio (url null) con la misma regla sí se conservan
 * todos (p. ej. varios sitemaps), pero cuentan como una sola evaluación en la puntuación.
 */
export function consolidate(findings: Finding[]): Finding[] {
  const out: Finding[] = [];
  const index = new Map<string, number>();
  for (const f of findings) {
    if (f.url === null) {
      out.push(f);
      continue;
    }
    const key = `${f.rule}|${f.url}|${Boolean(f.advisory)}`;
    const i = index.get(key);
    if (i === undefined) {
      index.set(key, out.length);
      out.push(f);
    } else if (RANK[f.severity] > RANK[out[i].severity]) out[i] = f;
  }
  return out;
}

export function countBySeverity(findings: Finding[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, high: 0, medium: 0, ok: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

/**
 * Puntuación 0–100: promedio ponderado (peso de la regla) del crédito de cada evaluación
 * (CORRECTO 1 · MEJORABLE 0.5 · GRAVE 0.25 · CRÍTICO 0). Es una heurística para seguir la
 * evolución de un mismo sitio, no una métrica de Google.
 */
export function summarize(
  findings: Finding[],
  pagesAudited: number,
): AuditSummary {
  // Evaluaciones: (regla, url). Para reglas de sitio repetidas, la peor.
  const evals = new Map<
    string,
    { rule: string; category: Category; severity: Severity }
  >();
  for (const f of findings) {
    if (f.advisory) continue;
    const key = `${f.rule}|${f.url ?? "*"}`;
    const prev = evals.get(key);
    if (!prev || RANK[f.severity] > RANK[prev.severity])
      evals.set(key, {
        rule: f.rule,
        category: f.category,
        severity: f.severity,
      });
  }
  let num = 0;
  let den = 0;
  const cat = new Map<
    Category,
    { num: number; den: number; failing: number }
  >();
  for (const e of evals.values()) {
    const w = ruleDef(e.rule)?.weight ?? 1;
    num += w * CREDIT[e.severity];
    den += w;
    const c = cat.get(e.category) ?? { num: 0, den: 0, failing: 0 };
    c.num += w * CREDIT[e.severity];
    c.den += w;
    if (e.severity !== "ok") c.failing++;
    cat.set(e.category, c);
  }
  return {
    counts: countBySeverity(findings),
    score: den ? Math.round((100 * num) / den) : 0,
    scoreVersion: SCORE_VERSION,
    byCategory: [...cat.entries()]
      .map(([category, c]) => ({
        category,
        score: Math.round((100 * c.num) / c.den),
        failing: c.failing,
      }))
      .sort((a, b) => a.score - b.score),
    pagesAudited,
    advisoryCount: findings.filter((f) => f.advisory).length,
    scoredChecks: evals.size,
  };
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "ok"];

export function sortFindings(findings: Finding[]): Finding[] {
  const ruleOrder = Object.keys(RULES);
  return [...findings].sort(
    (a, b) =>
      RANK[b.severity] - RANK[a.severity] ||
      ruleOrder.indexOf(a.rule) - ruleOrder.indexOf(b.rule) ||
      (a.url ?? "").localeCompare(b.url ?? ""),
  );
}
