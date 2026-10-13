import { CategoryScoreChart, scoreColor } from "@/components/charts/seo-charts";
import { Card } from "@/components/ui/card";
import { LEVEL_LABEL, type SeoAiResult } from "../analysis/schema";
import { CATEGORY_LABEL, SEVERITY_LABEL, type AuditSummary, type PageSummary, type PerformanceResult } from "../engine";

export function SummaryCards({ summary }: { summary: AuditSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <Card className="sm:col-span-1">
        <p className="text-xs uppercase text-muted">Puntuación</p>
        <p className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(summary.score) }}>
          {summary.score}
        </p>
        <p className="text-xs text-muted">{summary.scoreVersion}</p>
      </Card>
      {(["critical", "high", "medium", "ok"] as const).map((k) => (
        <Card key={k}>
          <p className="text-xs uppercase text-muted">{SEVERITY_LABEL[k]}</p>
          <p className="text-3xl font-semibold tabular-nums">{summary.counts[k]}</p>
        </Card>
      ))}
    </div>
  );
}

export function CategoryChart({ summary }: { summary: AuditSummary }) {
  return <CategoryScoreChart rows={summary.byCategory.map((c) => ({ label: CATEGORY_LABEL[c.category], score: c.score }))} />;
}

const sec = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

export function PerformanceCard({ perf }: { perf: PerformanceResult }) {
  const rows: [string, string, string][] = [
    ["LCP", perf.field?.lcpMs != null ? sec(perf.field.lcpMs) : "—", sec(perf.lab.lcpMs)],
    ["CLS", perf.field?.cls != null ? perf.field.cls.toFixed(2) : "—", perf.lab.cls != null ? perf.lab.cls.toFixed(2) : "—"],
    ["INP", perf.field?.inpMs != null ? `${Math.round(perf.field.inpMs)} ms` : "—", "— (sólo campo)"],
    ["TBT", "—", perf.lab.tbtMs != null ? `${Math.round(perf.lab.tbtMs)} ms` : "—"],
    ["FCP", "—", sec(perf.lab.fcpMs)],
  ];
  return (
    <Card className="space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">Rendimiento ({perf.strategy === "mobile" ? "móvil" : "escritorio"})</h3>
        {perf.performanceScore !== null ? (
          <p className="text-sm">
            Lighthouse: <strong style={{ color: scoreColor(perf.performanceScore) }}>{perf.performanceScore}/100</strong>
          </p>
        ) : null}
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            <th className="py-1">Métrica</th>
            <th className="py-1">Usuarios reales (CrUX p75)</th>
            <th className="py-1">Laboratorio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([m, f, l]) => (
            <tr key={m}>
              <td className="py-1 font-medium">{m}</td>
              <td className="py-1 tabular-nums">{f}</td>
              <td className="py-1 tabular-nums">{l}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!perf.field ? <p className="text-xs text-muted">Sin datos de campo: el sitio no tiene tráfico suficiente en CrUX. Se usan datos de laboratorio.</p> : null}
      {perf.opportunities.length ? (
        <div>
          <p className="text-sm font-medium">Oportunidades (ahorro estimado)</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {perf.opportunities.map((o) => (
              <li key={o.id}>
                {o.title} · <span className="tabular-nums text-muted">{sec(o.savingsMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function PagesTable({ pages }: { pages: PageSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-foreground/5 text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-2">URL</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Tiempo</th>
            <th className="px-3 py-2">Título</th>
            <th className="px-3 py-2">Palabras</th>
            <th className="px-3 py-2">Enlaces int.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pages.map((p) => (
            <tr key={p.url} className="align-top">
              <td className="max-w-64 break-all px-3 py-2 text-xs">
                {p.url}
                {p.finalUrl !== p.url ? <span className="block text-muted">→ {p.finalUrl}</span> : null}
              </td>
              <td className="px-3 py-2 tabular-nums">{p.status ?? (p.source === "upload" ? "subido" : "error")}</td>
              <td className="px-3 py-2 tabular-nums">{p.timeMs === null ? "—" : `${p.timeMs} ms`}</td>
              <td className="px-3 py-2">{p.title ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{p.wordCount ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{p.internalLinks ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FIELD_LABEL = { title: "Título", description: "Descripción", h1: "H1" } as const;

export function SeoPlanView({ plan }: { plan: SeoAiResult }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h3 className="font-medium">Resumen ejecutivo</h3>
        <p className="text-sm leading-relaxed">{plan.executiveSummary}</p>
      </Card>
      {plan.priorities.length ? (
        <div className="space-y-3">
          {plan.priorities.map((p, i) => (
            <Card key={p.title} className="space-y-2 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-medium">
                  {i + 1}. {p.title}
                </h4>
                <p className="text-xs text-muted">
                  Impacto {LEVEL_LABEL[p.impact].toLowerCase()} · esfuerzo {LEVEL_LABEL[p.effort].toLowerCase()}
                </p>
              </div>
              <p className="text-sm leading-relaxed">{p.rationale}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {p.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
      {plan.quickWins.length ? (
        <Card className="space-y-2">
          <h3 className="font-medium">Ganancias rápidas</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.quickWins.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {plan.rewrites.length ? (
        <Card className="space-y-2">
          <h3 className="font-medium">Propuestas de reescritura</h3>
          <p className="text-xs text-muted">Propuestas de la IA para revisión editorial; no se aplican automáticamente.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-3">Página</th>
                  <th className="py-1 pr-3">Campo</th>
                  <th className="py-1 pr-3">Actual</th>
                  <th className="py-1 pr-3">Propuesta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {plan.rewrites.map((r) => (
                  <tr key={`${r.url}-${r.field}`}>
                    <td className="max-w-48 break-all py-1.5 pr-3 text-xs text-muted">{r.url}</td>
                    <td className="py-1.5 pr-3">{FIELD_LABEL[r.field]}</td>
                    <td className="py-1.5 pr-3 text-muted">{r.current ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {r.proposal}
                      <span className="block text-xs text-muted">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {plan.limitations.length ? (
        <Card className="space-y-2">
          <h3 className="font-medium">Límites de esta auditoría</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
