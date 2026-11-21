import { IfdChart, TaskSuccessChart } from "@/components/charts/visual-charts";
import { PrintButton } from "@/components/print-button";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import type { FrictionRatingRow, IfdMeasurementRow, StudyRow } from "@/lib/db/types";
import { loadVisualStudyPage } from "@/tools/visual/load";
import type { SiteSummary } from "@/tools/visual/journey/model";
import { rubricItems } from "@/tools/visual/journey/rubric";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import {
  AiSummary,
  AllStrengths,
  BlindZones,
  CriteriaScores,
  FormatChecks,
  ImageMetrics,
  IssuesList,
  TextContrast,
  TopFindings,
  formatStatus,
} from "@/tools/visual/ui/asset-panels";
import { getPlacement } from "@/tools/visual/engine/placements";
import { StatusBadge } from "@/components/ui/status-badge";
import { AttentionViewer } from "@/tools/visual/ui/attention-viewer";
import { MethodNote } from "@/tools/visual/ui/journey-views";
import { loadReportSource, loadSavedReport, reportHash } from "@/tools/reports/load";
import { visualReportSnapshot } from "@/tools/reports/model";
import { AiReportPanel } from "@/tools/reports/ui/AiReportPanel";
import { StudyReportView } from "@/tools/reports/ui/StudyReportView";
import { VisualReportDashboard } from "@/tools/reports/ui/VisualReportDashboard";
import { RefreshReportButton } from "@/tools/reports/ui/RefreshReportButton";

export const metadata = { title: "Informe" };
export const maxDuration = 120;

/** Informe imprimible (el navegador lo guarda como PDF). */
export default async function ReportPage({ params }: PageProps<"/studies/[id]/report">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: candidate } = await supabase.from("studies").select("*").eq("id", id).in("tool_type", ["survey", "visual", "web_visual"]).maybeSingle<StudyRow>();
  if (!candidate) notFound();
  if (candidate.tool_type === "survey") {
    const source = await loadReportSource(supabase, candidate);
    if (source.kind !== "survey") notFound();
    const [{ data: project }, saved] = await Promise.all([
      supabase.from("projects").select("name").eq("id", candidate.project_id).maybeSingle(),
      loadSavedReport(supabase, id, "survey"),
    ]);
    return <StudyReportView study={candidate} projectName={project?.name ?? null} source={source} sourceHash={reportHash(source.snapshot)} saved={saved.report} loadError={saved.error} />;
  }
  const { study, config, projectName } = await loadVisualStudyPage(supabase, id, undefined, true);
  if (config.mode === "pieces" && config.eyeTracking) {
    const source = await loadReportSource(supabase, study);
    if (source.kind !== "eye") notFound();
    const [saved, urls] = await Promise.all([loadSavedReport(supabase, id, "eye"), assetUrls(supabase, source.assets.map((a) => a.row.storage_path), "thumb")]);
    const imageUrls = Object.fromEntries(source.assets.flatMap((a) => urls[a.row.storage_path] ? [[a.row.id, urls[a.row.storage_path]]] : []));
    return <StudyReportView study={study} projectName={projectName} source={source} sourceHash={reportHash(source.snapshot)} saved={saved.report} loadError={saved.error} imageUrls={imageUrls} />;
  }
  const assets = await loadAssets(supabase, id);
  const urls = await assetUrls(supabase, assets.map((a) => a.row.storage_path), "view");
  const today = new Date().toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

  const disclaimer = (
    <Card className="space-y-1 text-xs text-muted break-inside-avoid">
      <p className="font-medium text-foreground">Nota metodológica</p>
      <p>
        Los mapas de atención, recorridos y zonas ciegas son estimaciones expertas (lectura de IA revisada por el analista) basadas en principios de saliencia
        visual. No son eye tracking ni mediciones con personas. Las métricas de imagen (contraste, saturación, espacio negativo, formato) son mediciones
        deterministas sobre los píxeles.
      </p>
    </Card>
  );

  if (config.mode === "pieces") {
    const snapshot = visualReportSnapshot(study.name, config.objective, assets);
    const saved = await loadSavedReport(supabase, id, "visual");
    return (
      <div className="space-y-8">
        <StudyHeader study={study} projectName={projectName} subtitle={today} actions={<><RefreshReportButton /><PrintButton /></>} />
        <Card className="space-y-1 text-sm">
          <p>
            <span className="text-muted">Objetivo:</span> {config.objective}
          </p>
          {config.audience ? (
            <p>
              <span className="text-muted">Público:</span> {config.audience}
            </p>
          ) : null}
          <p className="text-muted">{assets.length} pieza(s) en el estudio.</p>
        </Card>
        <VisualReportDashboard studyId={id} snapshot={snapshot}>
          <AiReportPanel studyId={id} snapshot={snapshot} sourceHash={reportHash(snapshot)} saved={saved.report} loadError={saved.error} />
        </VisualReportDashboard>
        {assets.map((a, i) => {
          const placementSpec = getPlacement(a.row.placement);
          const imgData = { width: a.row.width, height: a.row.height, bytes: a.row.bytes, placement: a.row.placement };
          const fmt = formatStatus(imgData);

          return (
            <section key={a.row.id} className={`space-y-6 rounded-2xl border border-border bg-surface p-6 ${i ? "break-before-page" : ""}`}>
              {/* Encabezado de la pieza con metadatos y badges */}
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-heading">
                    {i + 1}. {a.row.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{a.row.width}×{a.row.height} px</span>
                    <span>·</span>
                    <span>{(a.row.bytes / 1024).toFixed(0)} KB</span>
                    {placementSpec ? (
                      <>
                        <span>·</span>
                        <span className="font-medium text-foreground">{placementSpec.label}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {fmt ? (
                    <StatusBadge tone={fmt.passed === fmt.total ? "success" : "warning"}>
                      {fmt.passed === fmt.total ? "Cumple formato" : `${fmt.passed}/${fmt.total} en formato`}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Sin formato</StatusBadge>
                  )}
                  <StatusBadge tone={a.ai ? "success" : "neutral"}>
                    {a.ai ? "Analizada con IA" : "Sin análisis de IA"}
                  </StatusBadge>
                </div>
              </div>

              {/* Visores de atención: Mapa de atención y Recorrido visual lado a lado */}
              {urls[a.row.storage_path] ? (
                <div className="space-y-2">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Mapa de atención estimado</p>
                      <AttentionViewer
                        imageUrl={urls[a.row.storage_path]}
                        width={a.row.width}
                        height={a.row.height}
                        aois={a.aois}
                        initialMode="heatmap"
                        showControls={false}
                        maxHeight="320px"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Recorrido visual previsto</p>
                      <AttentionViewer
                        imageUrl={urls[a.row.storage_path]}
                        width={a.row.width}
                        height={a.row.height}
                        aois={a.aois}
                        initialMode="gaze"
                        showControls={false}
                        maxHeight="320px"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Diagnóstico de IA: Calificador de criterios arriba + hallazgos principales */}
              {a.ai ? (
                <div className="space-y-6 pt-2">
                  <CriteriaScores result={a.ai.result} />
                  <AiSummary result={a.ai.result} />
                  <TopFindings result={a.ai.result} aois={a.aois} />
                  {a.ai.result.strengths.length > 3 ? (
                    <AllStrengths result={a.ai.result} from={3} title="Otros aciertos identificados" />
                  ) : null}
                  <IssuesList result={a.ai.result} />
                  <BlindZones aois={a.aois} />
                </div>
              ) : (
                <Card className="text-sm text-muted">Aún no se ha realizado el análisis de IA para esta pieza.</Card>
              )}

              {/* Verificación de formato y métricas de imagen deterministas */}
              <div className="space-y-4 border-t border-border pt-4">
                <h3 className="font-semibold text-heading text-base">Verificación técnica y píxeles</h3>
                <FormatChecks img={imgData} />
                {a.metrics ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextContrast metrics={a.metrics} />
                    <ImageMetrics metrics={a.metrics} />
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
        {disclaimer}
      </div>
    );
  }

  const { data: rows } = await supabase.from("ifd_measurements").select("*").eq("study_id", id).order("created_at", { ascending: false }).returns<IfdMeasurementRow[]>();
  const latest = (rows ?? []).filter((m) => m.run_id === rows?.[0]?.run_id).sort((a, b) => a.ifd - b.ifd);
  const { data: ratingRows } = await supabase.from("friction_ratings").select("*").eq("study_id", id).returns<FrictionRatingRow[]>();
  const items = rubricItems(config.tasks);
  const colorOf = (key: string) => Math.max(0, config.sites.findIndex((s) => s.key === key));
  const byConfigOrder = (ms: IfdMeasurementRow[]) => [...ms].sort((a, b) => colorOf(a.site_key) - colorOf(b.site_key));
  const assetTitle = new Map(assets.map((a) => [a.row.id, `${a.row.task_id} · ${a.row.title}`]));

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} subtitle={today} actions={<PrintButton />} />
      <Card className="space-y-1 text-sm">
        <p>
          <span className="text-muted">Objetivo:</span> {config.objective}
        </p>
        <p>
          <span className="text-muted">Sitios:</span> {config.sites.map((s) => `${s.name}${s.competitor ? "" : " (principal)"}`).join(", ")}
        </p>
        <p>
          <span className="text-muted">Tareas:</span> {config.tasks.map((t) => `${t.id} ${t.name}`).join(" · ")}
        </p>
      </Card>

      {latest.length ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Índice de Fricción Digital</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <IfdChart rows={latest.map((m) => ({ site: m.site_name, ifd: m.ifd, reading: m.reading, colorIndex: colorOf(m.site_key) }))} />
            <TaskSuccessChart
              rows={config.tasks.map((t) => ({ task: t.id, ...Object.fromEntries(latest.map((m) => [m.site_name, (m.summary as SiteSummary).successByTask[t.id] ?? 0])) }))}
              sites={byConfigOrder(latest).map((m) => ({ name: m.site_name, colorIndex: colorOf(m.site_key) }))}
            />
          </div>
          <MethodNote measurement={latest[0]} />
        </section>
      ) : (
        <EmptyState icon="flag" title="Aún no hay medición del IFD">
          Califica las capturas del recorrido en la pestaña Calificación para calcular el Índice de Fricción Digital.
        </EmptyState>
      )}

      {config.sites.map((site) => (
        <section key={site.key} className="space-y-3 break-before-page">
          <h2 className="text-xl font-semibold">Calificaciones · {site.name}</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-neuro-wash text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2">Ítem</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Justificación</th>
                  <th className="px-3 py-2">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {items.map((it) => {
                  const r = (ratingRows ?? []).find((x) => x.site_key === site.key && x.item_key === it.key);
                  return (
                    <tr key={it.key}>
                      <td className="px-3 py-2 font-medium">{it.label}</td>
                      <td className="px-3 py-2 tabular-nums">{r ? (it.kind === "boolean" ? (r.value >= 0.5 ? "Sí" : "No") : Number(r.value).toFixed(2)) : "sin dato"}</td>
                      <td className="px-3 py-2">
                        {r?.justification ?? "Sin calificar"}
                        {r?.source === "ai_assisted" ? <span className="block text-xs text-muted">Partió de una sugerencia de IA confirmada por el analista.</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{r?.evidence_asset_id ? (assetTitle.get(r.evidence_asset_id) ?? "sin dato") : "sin dato"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {disclaimer}
    </div>
  );
}
