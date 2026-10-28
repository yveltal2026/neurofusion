import { scoreBand, scoreColor } from "@/components/charts/score-color";
import { CategoryScoreChart } from "@/components/charts/seo-charts";
import { Block, Card } from "@/components/ui/card";
import { Glossary } from "@/components/ui/glossary";
import { SectionTitle } from "@/components/ui/section-title";
import { LEVEL_LABEL, type SeoAiResult } from "../analysis/schema";
import { SeverityBadge } from "./findings-table";
import { CATEGORY_LABEL, type AuditSummary, type PageSummary, type PerformanceResult } from "../engine";

/**
 * Resumen de la auditoría: la puntuación con su banda y el desglose por severidad en una sola franja.
 * Si PageSpeed devolvió la categoría SEO de Lighthouse, se muestra al lado con lo que mide cada una:
 * suelen diferir mucho y sin esa nota parecen contradecirse.
 */
export function SummaryCards({ summary, lighthouseSeo }: { summary: AuditSummary; lighthouseSeo?: number | null }) {
  const band = scoreBand(summary.score);
  const total = summary.counts.critical + summary.counts.high + summary.counts.medium + summary.counts.ok;
  return (
    <Card className="flex flex-wrap items-center gap-x-10 gap-y-4">
      <div className="flex items-baseline gap-3">
        <p className="font-display text-5xl font-bold tabular-nums leading-none" style={{ color: band.color }}>
          {summary.score}
        </p>
        <div>
          <p className="font-medium text-heading">Puntuación NeuroFusion · {band.label.toLowerCase()}</p>
          <p className="text-xs text-muted">de 100 · {summary.scoreVersion}</p>
        </div>
      </div>
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {(["critical", "high", "medium", "ok"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <dt>
              <SeverityBadge severity={k} />
            </dt>
            <dd className="font-semibold tabular-nums">{summary.counts[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{total} evaluaciones en {summary.pagesAudited} página(s)</p>
      {lighthouseSeo != null ? (
        <p className="basis-full border-t border-border pt-3 text-sm text-muted">
          <span className="text-foreground">
            SEO de Lighthouse (Google):{" "}
            <strong className="tabular-nums" style={{ color: scoreColor(lighthouseSeo) }}>
              {lighthouseSeo}/100
            </strong>
          </span>{" "}
          · revisa sólo la página principal, después de ejecutar JavaScript, con unas 10 comprobaciones básicas. La puntuación NeuroFusion
          rastrea {summary.pagesAudited} página(s) con todas las reglas sobre el HTML que entrega el servidor, así que suele ser más baja.
        </p>
      ) : null}
    </Card>
  );
}

export function CategoryChart({ summary }: { summary: AuditSummary }) {
  return <CategoryScoreChart rows={summary.byCategory.map((c) => ({ label: CATEGORY_LABEL[c.category], score: c.score }))} />;
}

const sec = (ms: number | null) => (ms === null ? "sin dato" : `${(ms / 1000).toFixed(1)} s`);

export function PerformanceCard({ perf }: { perf: PerformanceResult }) {
  const rows: [string, string, string][] = [
    ["LCP", perf.field?.lcpMs != null ? sec(perf.field.lcpMs) : "sin dato", sec(perf.lab.lcpMs)],
    ["CLS", perf.field?.cls != null ? perf.field.cls.toFixed(2) : "sin dato", perf.lab.cls != null ? perf.lab.cls.toFixed(2) : "sin dato"],
    ["INP", perf.field?.inpMs != null ? `${Math.round(perf.field.inpMs)} ms` : "sin dato", "sin dato (sólo campo)"],
    ["TBT", "sin dato", perf.lab.tbtMs != null ? `${Math.round(perf.lab.tbtMs)} ms` : "sin dato"],
    ["FCP", "sin dato", sec(perf.lab.fcpMs)],
  ];
  return (
    <Block className="space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Rendimiento ({perf.strategy === "mobile" ? "móvil" : "escritorio"})</h2>
        {perf.performanceScore !== null ? (
          <p className="text-sm">
            Lighthouse: <strong style={{ color: scoreColor(perf.performanceScore) }}>{perf.performanceScore}/100</strong> ·{" "}
            {scoreBand(perf.performanceScore).label.toLowerCase()}
          </p>
        ) : null}
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-sm font-semibold text-heading">
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
      <Glossary
        terms={[
          { term: "LCP", meaning: "Tiempo hasta que aparece el contenido principal. Menos de 2.5 s es bueno." },
          { term: "CLS", meaning: "Cuánto se mueve la página mientras carga. Menos de 0.1 es bueno." },
          { term: "INP", meaning: "Qué tan rápido responde la página al tocar o hacer clic. Menos de 200 ms es bueno." },
          { term: "TBT y FCP", meaning: "TBT: tiempo en que la página no responde mientras carga. FCP: tiempo hasta ver el primer contenido." },
          { term: "CrUX p75", meaning: "Medición de usuarios reales: el valor que el 75 % de las visitas igualan o mejoran." },
        ]}
      />
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
    </Block>
  );
}

export function PagesTable({ pages }: { pages: PageSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-neuro-wash text-xs font-semibold text-muted">
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
              <td className="px-3 py-2 tabular-nums">{p.timeMs === null ? "sin dato" : `${p.timeMs} ms`}</td>
              <td className="px-3 py-2">{p.title ?? "sin dato"}</td>
              <td className="px-3 py-2 tabular-nums">{p.wordCount ?? "sin dato"}</td>
              <td className="px-3 py-2 tabular-nums">{p.internalLinks ?? "sin dato"}</td>
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
      <Block className="space-y-2">
        <SectionTitle icon="neuro">Resumen ejecutivo</SectionTitle>
        <p className="text-sm leading-relaxed">{plan.executiveSummary}</p>
      </Block>
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
        <Block className="space-y-2">
          <SectionTitle icon="bolt">Ganancias rápidas</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.quickWins.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Block>
      ) : null}
      {plan.rewrites.length ? (
        <Block className="space-y-2">
          <SectionTitle icon="chat">Propuestas de reescritura</SectionTitle>
          <p className="text-xs text-muted">Propuestas de la IA para revisión editorial; no se aplican automáticamente.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-muted">
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
                    <td className="py-1.5 pr-3 text-muted">{r.current ?? "sin dato"}</td>
                    <td className="py-1.5 pr-3">
                      {r.proposal}
                      <span className="block text-xs text-muted">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ) : null}
      {plan.limitations.length ? (
        <Block className="space-y-2">
          <SectionTitle icon="alert">Límites de esta auditoría</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}
