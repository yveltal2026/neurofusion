import Link from "next/link";
import { AnalysisView } from "@/components/analysis-view";
import { ConcordanceChart, DirectionChart, HistogramChart, MeanDChart } from "@/components/charts/iat-charts";
import { RunAnalysisForm } from "@/components/run-analysis-form";
import { StudyTabs } from "@/components/study-tabs";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import { Glossary } from "@/components/ui/glossary";
import { NoticeList } from "@/components/ui/notice-list";
import { requireUser } from "@/lib/auth/session";
import { loadStudyForResearcher } from "@/lib/studies";
import { concordanceChart, directionChart, histogramChart, meanDChart } from "@/tools/iat/analysis/charts";
import { analysisResultSchema } from "@/tools/iat/analysis/schema";
import { buildWarnings } from "@/tools/iat/analysis/warnings";
import { computeStudyAggregates, interpretD } from "@/tools/iat/engine";
import type { DimensionAggregate, SegmentBreakdown } from "@/tools/iat/engine";
import { STRENGTH_LABEL } from "@/tools/iat/results/labels";
import { loadSessionViews } from "@/tools/iat/results/load";
import { toStatsSessions } from "@/tools/iat/results/views";

export const metadata = { title: "Análisis · NeuroFusion" };

// El análisis con IA puede tardar; las acciones de servidor heredan este límite.
export const maxDuration = 120;

const fmt = (x: number, d = 2) => x.toFixed(d);
const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

function StatsTable({ dims, config }: { dims: DimensionAggregate[]; config: Awaited<ReturnType<typeof loadStudyForResearcher>>["config"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-neuro-wash text-xs font-semibold text-muted">
          <tr>
            <th className="px-3 py-2">Dimensión</th>
            <th className="px-3 py-2">n</th>
            <th className="px-3 py-2">D medio</th>
            <th className="px-3 py-2">IC 95 %</th>
            <th className="px-3 py-2">t (gl)</th>
            <th className="px-3 py-2">p</th>
            <th className="px-3 py-2">d de Cohen</th>
            <th className="px-3 py-2">Lectura del D medio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dims.map((d) => {
            const t = d.test;
            const idx = typeof d.index === "number" ? d.index : null;
            let reading = "—";
            if (t) {
              const i = interpretD(t.mean);
              const dim = idx !== null ? config.dimensions[idx] : null;
              reading =
                i.strength === "none"
                  ? STRENGTH_LABEL.none
                  : dim
                    ? `${STRENGTH_LABEL[i.strength]} · ${i.direction === "A" ? config.conceptA.label : config.conceptB.label} más asociada a «${dim.positiveLabel}»`
                    : `${STRENGTH_LABEL[i.strength]} · favorece a ${i.direction === "A" ? config.conceptA.label : config.conceptB.label}`;
            }
            return (
              <tr key={String(d.index)}>
                <td className="px-3 py-2 font-medium">{d.label}</td>
                <td className="px-3 py-2 tabular-nums">{d.n}</td>
                <td className="px-3 py-2 tabular-nums">{t ? fmt(t.mean, 3) : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{t ? `[${fmt(t.ci95[0])}, ${fmt(t.ci95[1])}]` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{t ? `${fmt(t.t)} (${t.df})` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{t ? fmtP(t.p) : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{t ? fmt(t.cohenD) : "—"}</td>
                <td className="px-3 py-2">{reading}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({ title, data, dimNames }: { title: string; data: SegmentBreakdown; dimNames: string[] }) {
  if (data.groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neuro-wash text-xs font-semibold text-muted">
            <tr>
              <th className="px-3 py-2">Grupo</th>
              <th className="px-3 py-2">Sesiones</th>
              {dimNames.map((n) => (
                <th key={n} className="px-3 py-2">
                  D medio · {n}
                </th>
              ))}
              <th className="px-3 py-2">Compuesto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.groups.map((g) => (
              <tr key={g.group}>
                <td className="px-3 py-2">{g.group}</td>
                <td className="px-3 py-2 tabular-nums">{g.nSessions}</td>
                {g.meanD.map((m, i) => (
                  <td key={i} className="px-3 py-2 tabular-nums">
                    {m === null ? "—" : fmt(m)}
                  </td>
                ))}
                <td className="px-3 py-2 tabular-nums">{g.overallMeanD === null ? "—" : fmt(g.overallMeanD)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.suppressedGroups > 0 ? (
        <p className="text-xs text-muted">
          {data.suppressedGroups} grupo(s) omitido(s) por tener menos de 5 sesiones.
        </p>
      ) : null}
    </div>
  );
}

const DEVICE_NAMES: Record<string, string> = { desktop: "Escritorio", mobile: "Celular", tablet: "Tableta", unknown: "Desconocido" };

export default async function AnalysisPage({ params, searchParams }: PageProps<"/studies/[id]/analysis">) {
  const { id } = await params;
  const sp = await searchParams;
  const includeInvalid = sp.invalid === "1";
  const { supabase } = await requireUser();
  const { study, config, projectName } = await loadStudyForResearcher(supabase, id);

  const views = await loadSessionViews(supabase, id, config);
  const aggregates = computeStudyAggregates(toStatsSessions(config, views), {
    dimensionLabels: config.dimensions.map((d) => d.name),
    includeInvalid,
  });
  const completed = views.filter((v) => v.status === "completed");
  const warnings = buildWarnings(aggregates, {
    completed: completed.length,
    invalidCompleted: completed.filter((v) => v.allValid === false).length,
    duplicatesFlagged: views.filter((v) => v.duplicate_flag).length,
  });

  const { data: latest } = await supabase
    .from("analyses")
    .select("id, created_at, provider, model, n_sessions, include_invalid, result")
    .eq("study_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const parsed = latest ? analysisResultSchema.safeParse(latest.result) : null;
  const stale = latest && (latest.n_sessions !== aggregates.nWithUsableData || latest.include_invalid !== includeInvalid);

  const dimNames = config.dimensions.map((d) => d.name);
  const meanRows = meanDChart(aggregates);
  const directionRows = directionChart(aggregates);
  const concordanceRows = concordanceChart(aggregates);
  const customSegmentName = (v: string) =>
    v === "age_range" ? "Edad (rangos)" : v === "gender" ? "Género" : (config.participant.extraFields.find((f) => f.id === v)?.label ?? v);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={projectCrumbs(study.project_id, projectName)} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{study.name}</h1>
      </div>
      <StudyTabs id={id} active="analysis" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          Base del análisis: <strong className="text-foreground">{aggregates.nWithUsableData}</strong> participantes con datos utilizables
          ({completed.length} completadas).
        </p>
        <Link href={includeInvalid ? `/studies/${id}/analysis` : `/studies/${id}/analysis?invalid=1`} className="text-heading underline underline-offset-4">
          {includeInvalid ? "Excluir datos de calidad dudosa" : "Incluir también datos de calidad dudosa"}
        </Link>
      </div>

      <NoticeList notices={warnings} />

      {aggregates.nWithUsableData > 0 ? (
        <>
          <section className="space-y-3">
            <h2 className="font-medium">Estadísticos por dimensión</h2>
            <StatsTable dims={[...aggregates.dimensions, aggregates.overall]} config={config} />
            <Glossary
              terms={[
                { term: "D medio", meaning: "Promedio de las puntuaciones D: positivo si la marca A se asocia más al polo positivo; negativo si lo hace la B; cerca de 0, sin preferencia." },
                { term: "IC 95 %", meaning: "Rango donde, con 95 % de confianza, está el D medio real. Si incluye 0, no hay evidencia de asociación." },
                { term: "t (gl) y p", meaning: "Prueba contra D = 0 (dos colas). Un p menor a 0.05 indica que la asociación difícilmente es casualidad." },
                { term: "d de Cohen", meaning: "Tamaño del efecto: D medio entre la desviación estándar de D. Cerca de 0.2 es pequeño, 0.5 mediano y 0.8 o más grande." },
                { term: "Compuesto", meaning: "Promedio, por participante, de sus D utilizables en todas las dimensiones." },
              ]}
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Gráficas</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {meanRows.length ? <MeanDChart rows={meanRows} /> : null}
              {directionRows.length ? <DirectionChart rows={directionRows} labelA={config.conceptA.label} labelB={config.conceptB.label} /> : null}
              {concordanceRows.length ? <ConcordanceChart rows={concordanceRows} /> : null}
              {aggregates.dimensions.map((d) => (
                <HistogramChart key={String(d.index)} title={`Distribución de D · ${d.label}`} rows={histogramChart(d)} />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-medium">Desgloses</h2>
            <Breakdown
              title="Por dispositivo"
              data={{ ...aggregates.byDevice, groups: aggregates.byDevice.groups.map((g) => ({ ...g, group: DEVICE_NAMES[g.group] ?? g.group })) }}
              dimNames={dimNames}
            />
            {aggregates.bySegment.map((s) => (
              <Breakdown key={s.variable} title={`Por ${customSegmentName(s.variable).toLowerCase()}`} data={s} dimNames={dimNames} />
            ))}
          </section>
        </>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Conclusiones con IA</h2>
          <p className="text-sm text-muted">
            La IA redacta la interpretación a partir de los estadísticos de arriba; nunca recibe respuestas individuales ni datos
            personales. Las cifras oficiales son las de las tablas y gráficas.
          </p>
        </div>
        <RunAnalysisForm studyId={id} includeInvalid={includeInvalid} hasAnalysis={Boolean(latest)} />

        {latest && parsed?.success ? (
          <>
            <p className="text-xs text-muted">
              Generado el {new Date(latest.created_at).toLocaleString("es-MX")} · {latest.provider} · {latest.model} · n = {latest.n_sessions}
              {latest.include_invalid ? " (incluye datos dudosos)" : ""}
            </p>
            {stale ? (
              <Alert tone="warning">
                Este análisis es de una versión anterior de los datos (n = {latest.n_sessions}; ahora hay {aggregates.nWithUsableData}
                {latest.include_invalid !== includeInvalid ? ", o cambió la inclusión de datos dudosos" : ""}). Vuelve a analizar para actualizarlo.
              </Alert>
            ) : null}
            <AnalysisView result={parsed.data} />
          </>
        ) : latest ? (
          <Alert tone="warning">El análisis guardado tiene un formato no reconocido. Vuelve a generarlo.</Alert>
        ) : null}
      </section>
    </div>
  );
}
