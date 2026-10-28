import type { SeoAudit } from "./results";
import type { Finding } from "./engine";

type ComparableAudit = Pick<
  SeoAudit,
  "mode" | "siteUrl" | "engineVersion" | "summary" | "pages" | "findings"
>;
const rank = { ok: 0, medium: 1, high: 2, critical: 3 };
const key = (f: Finding) => JSON.stringify([f.rule, f.url]);
function evaluations(findings: Finding[]) {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    if (f.advisory) continue;
    const prev = map.get(key(f));
    if (!prev || rank[f.severity] > rank[prev.severity]) map.set(key(f), f);
  }
  return map;
}
const sorted = (values: string[]) =>
  JSON.stringify([...new Set(values)].sort());
function context(audit: ComparableAudit) {
  const s = audit.summary.scope;
  if (!s) return null;
  return JSON.stringify({
    keyword: s.targetKeyword,
    strategy: s.strategy,
    targets: [...s.pageTargets].sort((a, b) => a.url.localeCompare(b.url)),
  });
}

/** La ausencia de una evaluación nunca prueba que el problema se haya resuelto. */
export function compareAudits(
  current: ComparableAudit,
  previous: ComparableAudit,
) {
  const empty = {
    newIssues: [] as Finding[],
    resolved: [] as Finding[],
    persistent: [] as Finding[],
    firstObserved: [] as Finding[],
    unverified: [] as Finding[],
    scoreDelta: null as number | null,
  };
  let reason: string | null = null;
  if (current.mode !== previous.mode)
    reason = "Las auditorías usan modos distintos (en vivo / HTML subido).";
  else if (current.siteUrl !== previous.siteUrl)
    reason = "Cambió la URL principal del sitio.";
  else if (
    current.engineVersion !== previous.engineVersion ||
    current.summary.scoreVersion !== previous.summary.scoreVersion
  )
    reason =
      "Cambió el motor o la puntuación. Ejecuta otra auditoría con la misma versión para iniciar una comparación fiable.";
  else if (!context(current) || !context(previous))
    reason =
      "Falta la configuración histórica de alguna auditoría. No se puede confirmar que se evaluó con los mismos objetivos.";
  else if (context(current) !== context(previous))
    reason =
      "Cambiaron los objetivos, palabras clave o el dispositivo de rendimiento.";
  if (reason)
    return { ...empty, compatible: false, sameCoverage: false, reason };

  const before = evaluations(previous.findings);
  const after = evaluations(current.findings);
  const samePages =
    sorted(current.pages.map((p) => p.url)) ===
    sorted(previous.pages.map((p) => p.url));
  const htmlSample = (audit: ComparableAudit) =>
    sorted(
      audit.pages
        .filter(
          (p) =>
            p.wordCount !== null && (p.source === "upload" || p.status === 200),
        )
        .map((p) => p.url),
    );
  const sameContentSample = htmlSample(current) === htmlSample(previous);
  for (const [id, old] of before) {
    if (old.severity === "ok") continue;
    const next = after.get(id);
    if (
      !next ||
      (!samePages && old.url === null) ||
      (!sameContentSample && old.rule.startsWith("site.duplicate"))
    )
      empty.unverified.push(old);
    else if (next.severity === "ok") empty.resolved.push(next);
    else empty.persistent.push(next);
  }
  for (const [id, next] of after) {
    if (next.severity === "ok") continue;
    const old = before.get(id);
    if (
      !old ||
      (!samePages && next.url === null) ||
      (!sameContentSample && next.rule.startsWith("site.duplicate"))
    )
      empty.firstObserved.push(next);
    else if (old.severity === "ok") empty.newIssues.push(next);
  }
  const sameCoverage =
    samePages && sorted([...before.keys()]) === sorted([...after.keys()]);
  if (
    sameCoverage &&
    current.summary.scoredChecks !== 0 &&
    previous.summary.scoredChecks !== 0
  )
    empty.scoreDelta = current.summary.score - previous.summary.score;
  return {
    ...empty,
    compatible: true,
    sameCoverage,
    reason: sameCoverage
      ? null
      : "La cobertura o las comprobaciones difieren. Se comparan sólo evaluaciones coincidentes y no se calcula una diferencia global de puntuación.",
  };
}
