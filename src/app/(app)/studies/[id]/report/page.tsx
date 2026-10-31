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
import { AiReading, MetricsPanel } from "@/tools/visual/ui/asset-panels";
import { AttentionViewer } from "@/tools/visual/ui/attention-viewer";
import { MethodNote } from "@/tools/visual/ui/journey-views";
import { loadReportSource, loadSavedReport, reportHash } from "@/tools/reports/load";
import { visualReportSnapshot } from "@/tools/reports/model";
import { AiReportPanel } from "@/tools/reports/ui/AiReportPanel";
import { StudyReportView } from "@/tools/reports/ui/StudyReportView";
import { VisualReportDashboard } from "@/tools/reports/ui/VisualReportDashboard";
import { RefreshReportButton } from "@/tools/reports/ui/RefreshReportButton";

export const metadata = { title: "Informe · NeuroFusion" };
export const maxDuration = 120;

/** Informe imprimible (el navegador lo guarda como PDF). */
export default async function ReportPage({ params }: PageProps<"/studies/[id]/report">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: candidate } = await supabase.from("studies").select("*").eq("id", id).in("tool_type", ["survey", "visual"]).maybeSingle<StudyRow>();
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
  const variant = config.mode === "journey" ? "journey" : "pieces";

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
        <StudyHeader study={study} projectName={projectName} active="report" variant={variant} subtitle={today} actions={<><RefreshReportButton /><PrintButton /></>} />
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
        {assets.map((a, i) => (
          <section key={a.row.id} className={`space-y-4 ${i ? "break-before-page" : ""}`}>
            <h2 className="text-xl font-semibold">
              {i + 1}. {a.row.title}
            </h2>
            {urls[a.row.storage_path] ? (
              <div className="grid gap-4 md:grid-cols-2">
                <AttentionViewer imageUrl={urls[a.row.storage_path]} width={a.row.width} height={a.row.height} aois={a.aois} initialMode="heatmap" showControls={false} />
                <AttentionViewer imageUrl={urls[a.row.storage_path]} width={a.row.width} height={a.row.height} aois={a.aois} initialMode="gaze" showControls={false} />
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {a.ai ? <AiReading result={a.ai.result} aois={a.aois} analyzedAois={a.ai.aois} asset={{ id: a.row.id, title: a.row.title }} /> : <Card className="text-sm text-muted">Sin análisis de IA.</Card>}
              {a.metrics ? <MetricsPanel metrics={a.metrics} img={{ width: a.row.width, height: a.row.height, bytes: a.row.bytes, placement: a.row.placement }} /> : null}
            </div>
          </section>
        ))}
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
      <StudyHeader study={study} projectName={projectName} active="report" variant={variant} subtitle={today} actions={<PrintButton />} />
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
