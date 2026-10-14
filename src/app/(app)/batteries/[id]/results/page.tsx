import Link from "next/link";
import { BatteryTabs } from "@/components/battery-tabs";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { StatTile } from "@/components/ui/stat-tile";
import { requireUser } from "@/lib/auth/session";
import { loadBatteryForResearcher } from "@/lib/batteries";
import { buildBatteryReport } from "@/tools/battery/engine/report";
import { reportMeasures, toParticipants } from "@/tools/battery/measures";
import { loadBatteryReportData } from "@/tools/battery/results";

const nf = (d: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (x: number | null, d = 2) => (x === null ? "—" : nf(d).format(x));
const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : nf(3).format(p));

export default async function BatteryResultsPage({ params, searchParams }: PageProps<"/batteries/[id]/results">) {
  const { id } = await params;
  const sp = await searchParams;
  const includeInvalid = sp.invalid === "1";
  const { supabase } = await requireUser();
  const { battery, projectName } = await loadBatteryForResearcher(supabase, id);

  const data = await loadBatteryReportData(supabase, id);
  const measures = reportMeasures(data.steps);
  const report = buildBatteryReport(measures, toParticipants(data.sessions, { includeInvalid }));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <IconTile name="layers" size="lg" className="mt-1 hidden sm:inline-flex" />
          <div>
            <Link href={`/projects/${battery.project_id}`} className="inline-block py-1 text-sm text-muted hover:underline print:hidden">
              ← {projectName ?? "Proyecto"}
            </Link>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{battery.name}</h1>
          </div>
        </div>
        <BatteryTabs id={id} active="results" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="user" label="Sesiones iniciadas" value={report.funnel.total} />
        <StatTile icon="check" label="Completas" value={report.funnel.completed} />
        <StatTile icon="ban" label="Excluidas" value={report.funnel.excluded} />
        <StatTile icon="results" label="En el informe" value={report.funnel.included} />
      </div>

      {report.warnings.length ? (
        <ul className="space-y-2">
          {report.warnings.map((w) => (
            <li key={w}>
              <Alert tone={w.startsWith("Correlación no implica") ? "info" : "warning"}>{w}</Alert>
            </li>
          ))}
        </ul>
      ) : null}

      {measures.length === 0 ? (
        <EmptyState icon="layers" title="Esta batería aún no tiene medidas para cruzar">
          El informe cruza el D del IAT con las puntuaciones de instrumentos de las encuestas (SUS, NPS, SAM, intención de compra, actitud).
        </EmptyState>
      ) : (
        <>
          <section className="space-y-3">
            <SectionTitle icon="neuro">Medidas</SectionTitle>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-foreground/5 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Medida</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Evidencia</th>
                    <th className="px-3 py-2">n</th>
                    <th className="px-3 py-2">Media</th>
                    <th className="px-3 py-2">IC 95 %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.measures.map((m) => (
                    <tr key={m.key}>
                      <td className="px-3 py-2 font-medium">{m.label}</td>
                      <td className="px-3 py-2">{m.family === "implicit" ? "Implícita" : "Explícita"}</td>
                      <td className="px-3 py-2">{m.evidence}</td>
                      <td className="px-3 py-2 tabular-nums">{m.n}</td>
                      <td className="px-3 py-2 tabular-nums">{m.suppressed ? "—" : fmt(m.mean)}</td>
                      <td className="px-3 py-2 tabular-nums">{m.ci95 ? `${fmt(m.ci95[0])} a ${fmt(m.ci95[1])}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              Con menos de 5 participantes no se muestra ninguna cifra, para no identificar a nadie. «Medido» = datos de participantes reales en
              esta batería.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle icon="target">Implícito frente a explícito</SectionTitle>
              <Link
                href={includeInvalid ? `/batteries/${id}/results` : `/batteries/${id}/results?invalid=1`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-heading underline underline-offset-4"
              >
                <Icon name="eye" className="size-5" />
                {includeInvalid ? "Excluir datos de calidad dudosa del IAT" : "Incluir también datos de calidad dudosa del IAT"}
              </Link>
            </div>
            {report.correlations.length === 0 ? (
              <Card className="text-sm text-muted">Hace falta al menos un IAT y una encuesta con instrumentos para cruzar.</Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-foreground/5 text-xs uppercase text-muted">
                    <tr>
                      <th className="px-3 py-2">Implícita</th>
                      <th className="px-3 py-2">Explícita</th>
                      <th className="px-3 py-2">n</th>
                      <th className="px-3 py-2">r</th>
                      <th className="px-3 py-2">IC 95 %</th>
                      <th className="px-3 py-2">p</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.correlations.map((c) => (
                      <tr key={`${c.a}~${c.b}`}>
                        <td className="px-3 py-2">{c.aLabel}</td>
                        <td className="px-3 py-2">{c.bLabel}</td>
                        <td className="px-3 py-2 tabular-nums">{c.n}</td>
                        {c.r === null ? (
                          <td className="px-3 py-2 text-muted" colSpan={3}>
                            {c.reason}
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-2 tabular-nums">
                              {fmt(c.r)}
                              {c.smallSample ? <span className="ml-1 text-xs text-muted">(muestra pequeña)</span> : null}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{c.ci95 ? `${fmt(c.ci95[0])} a ${fmt(c.ci95[1])}` : "—"}</td>
                            <td className="px-3 py-2 tabular-nums">{c.p === null ? "—" : fmtP(c.p)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted">
              r de Pearson con intervalo por la transformación z de Fisher. Un D positivo indica asociación del primer concepto con el polo positivo;
              interprétalo junto con la dirección de cada escala (p. ej. un NPS alto es favorable). Sólo entran participantes con ambas medidas.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
