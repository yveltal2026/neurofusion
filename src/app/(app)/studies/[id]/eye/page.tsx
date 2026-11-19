import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { setSessionExcluded } from "@/app/(app)/studies/[id]/data/actions";
import { buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import type { EyeTrackingRunRow, StudyRow } from "@/lib/db/types";
import { resolveEyeMediaType, visualConfigSchema } from "@/tools/visual/config";
import { EyeResults } from "@/tools/eyetracking/ui/eye-results";
import { eyeObservationSchema, eyeQualitySchema } from "@/tools/visual/eye/schema";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import { VideoAttentionAffectViewer } from "@/tools/visual/video/VideoAttentionAffectViewer";
import { aggregateVideoStudy } from "@/tools/visual/video/metrics";
import { readR2Config, resolveR2PlaybackUrl } from "@/tools/visual/video/r2.server";
import { videoObservationSchema } from "@/tools/visual/video/schema";

export const metadata = { title: "Miradas reales" };

export default async function EyeResultsPage({ params, searchParams }: PageProps<"/studies/[id]/eye">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const showSessions = query.view === "sessions";
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).eq("tool_type", "visual").maybeSingle<StudyRow>();
  if (!study) notFound();
  const config = visualConfigSchema.safeParse(study.config);
  if (!config.success || config.data.mode !== "pieces" || !config.data.eyeTracking) notFound();
  const isVideo = resolveEyeMediaType(config.data.eyeTracking) === "video";
  const videoCfg = config.data.eyeTracking.video;

  const { data: project } = await supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle();
  const assets = isVideo || showSessions ? [] : await loadAssets(supabase, study.id);
  const urls = isVideo || showSessions ? {} : await assetUrls(supabase, assets.map((a) => a.row.storage_path), "view");
  const { data: stored } = await supabase.from("eye_tracking_runs")
    .select("session_id, study_id, validation, observations, created_at")
    .eq("study_id", study.id).order("created_at", { ascending: false }).limit(100)
    .returns<EyeTrackingRunRow[]>();
  const { data: sessionRows } = stored?.length
    ? await supabase.from("sessions").select("id, participant_ref, device_type, duplicate_flag, excluded, started_at")
      .eq("study_id", study.id).in("id", stored.map((r) => r.session_id))
    : { data: [] };
  const sessionMap = new Map((sessionRows ?? []).map((s) => [s.id, s]));

  const imageRuns = isVideo
    ? []
    : (stored ?? []).flatMap((row) => {
        const quality = eyeQualitySchema.safeParse(row.validation);
        const observations = eyeObservationSchema.array().safeParse(row.observations);
        const session = sessionMap.get(row.session_id);
        return quality.success && observations.success && session
          ? [{ id: row.session_id, quality: quality.data, observations: observations.data, session }]
          : [];
      });

  const videoRuns = !isVideo
    ? []
    : (stored ?? []).flatMap((row) => {
        const quality = eyeQualitySchema.safeParse(row.validation);
        const observations = videoObservationSchema.array().safeParse(row.observations);
        const session = sessionMap.get(row.session_id);
        return quality.success && observations.success && session
          ? [{ id: row.session_id, quality: quality.data, observations: observations.data, session }]
          : [];
      });

  const runs = isVideo ? videoRuns : imageRuns;
  const goodImageRuns = imageRuns.filter((r) => r.quality.passed && r.quality.measurementStatus !== "limited" && !r.session.excluded);
  const goodVideoRuns = videoRuns.filter((r) => r.quality.passed && r.quality.measurementStatus !== "limited" && !r.session.excluded);
  const goodCount = isVideo ? goodVideoRuns.length : goodImageRuns.length;

  const r2Config = readR2Config();
  const playbackUrl =
    isVideo && videoCfg?.r2Key && r2Config
      ? resolveR2PlaybackUrl({ config: r2Config, key: videoCfg.r2Key, expiresInSeconds: 3600 })
      : (videoCfg?.playbackUrl ?? "");

  const videoParticipants = goodVideoRuns.flatMap((run) =>
    run.observations[0]
      ? [{ sessionId: run.id, participant: run.session.participant_ref, observation: run.observations[0] }]
      : [],
  );

  const durationMs =
    videoCfg?.durationMs ??
    videoParticipants[0]?.observation.durationMs ??
    (videoCfg?.maxDurationSeconds ?? 120) * 1000;

  const aggregatedVideo =
    !showSessions && isVideo && playbackUrl
      ? aggregateVideoStudy(
          videoParticipants,
          {
            durationMs,
            aois: videoCfg?.aois ?? [],
            scenes: videoCfg?.scenes ?? [],
            binMs: 1000,
          },
          {
            width: videoCfg?.videoWidth ?? 1280,
            height: videoCfg?.videoHeight ?? 720,
          },
        )
      : null;

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={project?.name}
        active={showSessions ? "sessions" : "results"}
        variant="eye"
        subtitle={isVideo ? "Miradas y Facial Coding en video" : "Miradas medidas con webcam"}
        actions={<a href={`/api/studies/${id}/eye/export`} className={buttonClass("secondary")}>Descargar lecturas CSV</a>}
      />
      <section className="glass-panel space-y-4 rounded-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-heading">Calidad de las sesiones</h2>
            <p className="mt-0.5 text-xs text-muted">
              Los resultados incluyen sólo sesiones que cumplieron los umbrales de calibración y no están excluidas.
            </p>
          </div>

        </div>

        <StatStrip
          items={[
            { icon: "user", label: "Consultadas", value: runs.length },
            { icon: "check", label: "Incluidas en resultados", value: goodCount },
            {
              icon: "alert",
              label: "Baja calidad o precisión limitada",
              value: runs.filter((r) => !r.session.excluded && (!r.quality.passed || r.quality.measurementStatus === "limited")).length,
              attention: true,
            },
            {
              icon: "ban",
              label: "Excluidas",
              value: runs.filter((r) => r.session.excluded).length,
              attention: true,
            },
          ]}
        />

        {(stored?.length ?? 0) === 100 ? (
          <Alert tone="warning">Se muestran las 100 sesiones más recientes.</Alert>
        ) : null}
      </section>

      {showSessions ? null : isVideo ? (
        !playbackUrl ? (
          <Alert tone="warning">Aún no hay video cargado para este estudio.</Alert>
        ) : aggregatedVideo ? (
          <VideoAttentionAffectViewer
            title={videoCfg?.title || study.name}
            playbackUrl={playbackUrl}
            durationMs={durationMs}
            aois={videoCfg?.aois ?? []}
            aggregateAois={aggregatedVideo.aois}
            aggregateScenes={aggregatedVideo.scenes}
            timeline={aggregatedVideo.timeline}
            observations={videoParticipants.map((p) => p.observation)}
          />
        ) : null
      ) : assets.length === 0 ? (
        <Alert tone="warning">Aún no hay piezas para medir.</Alert>
      ) : (
        assets.map((asset) => {
          const participants = goodImageRuns.flatMap((run) =>
            run.observations
              .filter((o) => o.assetId === asset.row.id)
              .map((observation) => ({
                sessionId: run.id,
                participant: run.session.participant_ref,
                observation,
              })),
          );
          return (
            <div key={asset.row.id} className="glass-panel rounded-panel p-4 sm:p-6">
              <EyeResults
                studyId={id}
                assetId={asset.row.id}
                title={asset.row.title}
                imageUrl={urls[asset.row.storage_path]}
                width={asset.row.width}
                height={asset.row.height}
                aois={asset.aois}
                participants={participants}
              />
            </div>
          );
        })
      )}

      {showSessions && runs.length ? (
        <section className="glass-panel space-y-4 rounded-panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-heading">Sesiones</h2>
            <span className="text-xs text-muted tabular-nums">{runs.length} registros</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-2xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/50 text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Dispositivo</th>
                  <th className="px-3 py-2.5">Error mediano</th>
                  <th className="px-3 py-2.5">Deriva máxima</th>
                  <th className="px-3 py-2.5">Calidad</th>
                  <th className="px-3 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id} className="transition hover:bg-foreground/2">
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-heading tabular-nums">
                      {run.session.participant_ref}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {run.session.device_type}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {run.quality.medianErrorDeg !== null && run.quality.medianErrorDeg !== undefined
                        ? `${run.quality.medianErrorDeg.toFixed(1)}°`
                        : "sin dato"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted tabular-nums">
                      {run.quality.driftChecks?.length
                        ? `${Math.max(...run.quality.driftChecks.map((c) => c.maxErrorDeg ?? 0)).toFixed(1)}° · ${run.quality.driftChecks.length} controles`
                        : "sin dato"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {run.session.excluded ? (
                          <StatusBadge tone="neutral">Excluida</StatusBadge>
                        ) : run.quality.measurementStatus === "limited" ? (
                          <StatusBadge tone="warning">Precisión limitada</StatusBadge>
                        ) : run.quality.passed ? (
                          <StatusBadge tone="success">Aceptable</StatusBadge>
                        ) : (
                          <StatusBadge tone="danger">Baja calidad</StatusBadge>
                        )}
                        {run.session.duplicate_flag ? (
                          <StatusBadge tone="warning">Posible duplicado</StatusBadge>
                        ) : null}
                      </div>
                      {run.quality.recovery ? (
                        <p className="mt-1 text-2xs text-muted">
                          {run.quality.recovery.interruptions} pausas ·{" "}
                          {run.quality.recovery.recalibrations} recalibraciones ·{" "}
                          {run.quality.recovery.repeatedAssetIds.length} repeticiones
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <form action={setSessionExcluded}>
                        <input type="hidden" name="studyId" value={study.id} />
                        <input type="hidden" name="sessionId" value={run.id} />
                        <input
                          type="hidden"
                          name="excluded"
                          value={run.session.excluded ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="min-h-11 text-xs font-semibold text-heading underline underline-offset-4 hover:text-accent-ink"
                        >
                          {run.session.excluded ? "Reincorporar" : "Excluir"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : showSessions ? <Alert tone="info">Aún no hay sesiones registradas.</Alert> : null}
    </div>
  );
}
