import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { setSessionExcluded } from "@/app/(app)/studies/[id]/data/actions";
import { buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { EyeTrackingRunRow, StudyRow } from "@/lib/db/types";
import { visualConfigSchema } from "@/tools/visual/config";
import { buildEyeHeatmap } from "@/tools/visual/eye/heatmap";
import { eyeObservationSchema, eyeQualitySchema, type EyeObservation } from "@/tools/visual/eye/schema";
import { assetUrls, loadAssets } from "@/tools/visual/results";

export const metadata = { title: "Miradas reales · NeuroFusion" };

export default async function EyeResultsPage({ params }: PageProps<"/studies/[id]/eye">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).eq("tool_type", "visual").maybeSingle<StudyRow>();
  if (!study) notFound();
  const config = visualConfigSchema.safeParse(study.config);
  if (!config.success || config.data.mode !== "pieces" || !config.data.eyeTracking) notFound();
  const { data: project } = await supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle();
  const assets = await loadAssets(supabase, study.id);
  const urls = await assetUrls(supabase, assets.map((a) => a.row.storage_path), "view");
  const { data: stored } = await supabase.from("eye_tracking_runs")
    .select("session_id, study_id, validation, observations, created_at")
    .eq("study_id", study.id).order("created_at", { ascending: false }).limit(100)
    .returns<EyeTrackingRunRow[]>();
  const { data: sessionRows } = stored?.length
    ? await supabase.from("sessions").select("id, participant_ref, device_type, duplicate_flag, excluded, started_at")
      .eq("study_id", study.id).in("id", stored.map((r) => r.session_id))
    : { data: [] };
  const sessionMap = new Map((sessionRows ?? []).map((s) => [s.id, s]));
  const runs = (stored ?? []).flatMap((row) => {
    const quality = eyeQualitySchema.safeParse(row.validation);
    const observations = eyeObservationSchema.array().safeParse(row.observations);
    const session = sessionMap.get(row.session_id);
    return quality.success && observations.success && session
      ? [{ id: row.session_id, quality: quality.data, observations: observations.data, session }]
      : [];
  });
  const good = runs.filter((r) => r.quality.passed && r.quality.measurementStatus !== "limited" && !r.session.excluded);

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={project?.name} active="results" variant="eye" subtitle="Miradas medidas con webcam" />
      <Card className="space-y-2">
        <h2 className="font-medium">Calidad de las sesiones</h2>
        <p className="text-sm">{runs.length} sesiones consultadas · {good.length} incluidas en mapas · {runs.filter((r) => !r.quality.passed).length} con baja calidad · {runs.filter((r) => r.session.excluded).length} excluidas.</p>
        <p className="text-xs text-muted">Los mapas incluyen sólo sesiones que cumplieron los umbrales de calibración. Cada sesión aporta el mismo peso, sin importar los fotogramas por segundo.</p>
        <a href={`/api/studies/${id}/eye/export`} className={buttonClass("secondary", "inline-flex")}>Descargar lecturas CSV</a>
        {(stored?.length ?? 0) === 100 ? <Alert tone="warning">Se muestran las 100 sesiones más recientes.</Alert> : null}
      </Card>
      {assets.length === 0 ? <Alert tone="warning">Aún no hay piezas para medir.</Alert> : assets.map((asset) => {
        const observations: EyeObservation[] = good.flatMap((run) => run.observations.filter((o) => o.assetId === asset.row.id));
        const heat = buildEyeHeatmap(observations);
        const url = urls[asset.row.storage_path];
        return (
          <Card key={asset.row.id} className="space-y-3">
            <div>
              <h2 className="font-medium">{asset.row.title}</h2>
              <p className="text-xs text-muted">{observations.length} sesiones válidas · {observations.reduce((n, o) => n + o.samples.length, 0)} lecturas dentro de la imagen</p>
            </div>
            {url ? (
              <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded border border-border" style={{ aspectRatio: `${asset.row.width} / ${asset.row.height}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage */}
                <img src={url} alt={asset.row.title} className="absolute inset-0 size-full object-contain" />
                <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-label="Mapa de atención medido">
                  {heat.map((cell, i) => (
                    <circle key={i} cx={cell.x} cy={cell.y} r={0.035} fill="var(--danger)" opacity={Math.min(0.7, 0.12 + cell.strength * 0.5)} />
                  ))}
                </svg>
              </div>
            ) : <Alert tone="warning">No se pudo abrir la imagen almacenada.</Alert>}
            {!heat.length ? <p className="text-sm text-muted">Todavía no hay lecturas de calidad suficiente para esta pieza.</p> : null}
          </Card>
        );
      })}
      {runs.length ? (
        <Card className="space-y-3">
          <h2 className="font-medium">Sesiones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="pr-4">Código</th><th className="pr-4">Dispositivo</th><th className="pr-4">Error mediano</th><th className="pr-4">Deriva máxima</th><th className="pr-4">Calidad</th><th>Acción</th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="py-2 pr-4 font-mono text-xs">{run.session.participant_ref}</td>
                    <td className="pr-4">{run.session.device_type}</td>
                    <td className="pr-4">{run.quality.medianErrorDeg?.toFixed(1) ?? "—"}°</td>
                    <td className="pr-4">{run.quality.driftChecks?.length
                      ? `${Math.max(...run.quality.driftChecks.map((c) => c.maxErrorDeg ?? 0)).toFixed(1)}° · ${run.quality.driftChecks.length} controles`
                      : "—"}</td>
                    <td className="pr-4">
                      {run.session.excluded ? "Excluida" : run.quality.measurementStatus === "limited" ? "Precisión limitada · fuera de mapas" : run.quality.passed ? "Aceptable" : "Baja"}{run.session.duplicate_flag ? " · posible duplicado" : ""}
                      {run.quality.recovery ? <p className="text-xs text-muted">
                        {run.quality.recovery.interruptions} pausas · {run.quality.recovery.recalibrations} recalibraciones · {run.quality.recovery.repeatedAssetIds.length} imágenes repetidas
                      </p> : null}
                    </td>
                    <td>
                      <form action={setSessionExcluded}>
                        <input type="hidden" name="studyId" value={study.id} />
                        <input type="hidden" name="sessionId" value={run.id} />
                        <input type="hidden" name="excluded" value={run.session.excluded ? "false" : "true"} />
                        <button type="submit" className="text-heading underline underline-offset-4">{run.session.excluded ? "Reincorporar" : "Excluir"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
