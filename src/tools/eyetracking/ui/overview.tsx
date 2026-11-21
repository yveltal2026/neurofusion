import Link from "next/link";
import { headers } from "next/headers";
import { CopyLink } from "@/components/copy-link";
import { StudyHeader } from "@/components/study-header";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/brand/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StudyRow } from "@/lib/db/types";
import { publicEnv } from "@/lib/env";
import { magicLinkUrl } from "@/lib/magic-link";
import { createClient } from "@/lib/supabase/server";
import { regenerateLink } from "@/app/(app)/studies/[id]/actions";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import { AssetUploader } from "@/tools/visual/ui/uploader";
import { isR2Configured, readR2Config, resolveR2PlaybackUrl } from "@/tools/visual/video/r2.server";
import {
  eyeStudyConfigSchema,
  isEyeFacialCodingEnabled,
  resolveEyeMediaType,
} from "../config";
import { VideoSetupCard } from "./video-setup-card";

async function countActiveSessions(supabase: Awaited<ReturnType<typeof createClient>>, studyId: string) {
  const { count } = await supabase.from("sessions").select("id", { count: "exact", head: true })
    .eq("study_id", studyId).eq("status", "started")
    .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());
  return count;
}

export async function EyeOverview({ study, projectName, created }: { study: StudyRow; projectName: string | null; created: boolean }) {
  const config = eyeStudyConfigSchema.parse(study.config);
  const mediaType = resolveEyeMediaType(config.eyeTracking);
  const facialCoding = isEyeFacialCodingEnabled(config.eyeTracking);
  const isVideo = mediaType === "video";
  const videoConfig = config.eyeTracking.video;
  const r2Config = readR2Config();
  const r2Configured = isR2Configured();
  const resolvedPlaybackUrl =
    isVideo && videoConfig?.r2Key && r2Config
      ? resolveR2PlaybackUrl({ config: r2Config, key: videoConfig.r2Key, expiresInSeconds: 3600 })
      : videoConfig?.playbackUrl;

  const supabase = await createClient();
  const [assets, { count: runs }, active, h] = await Promise.all([
    isVideo ? [] : loadAssets(supabase, study.id),
    supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", study.id),
    countActiveSessions(supabase, study.id),
    headers(),
  ]);
  const urls = isVideo ? {} : await assetUrls(supabase, assets.map((a) => a.row.storage_path), "thumb");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const link = study.access_token ? magicLinkUrl(host ? `${proto}://${host}` : publicEnv().appUrl, study.access_token) : null;
  const hasVideoSource = Boolean(videoConfig?.r2Key || videoConfig?.playbackUrl);
  const canShare = link && study.status === "published" && (isVideo ? hasVideoSource : assets.length > 0);

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        subtitle={isVideo ? "Eye tracking en video + Facial Coding" : "Medición de mirada con participantes"}
        actions={canShare ? (
          <a href="#study-invitation" className={buttonClass()}>
            <Icon name="link" className="size-5" />
            Compartir liga
          </a>
        ) : null}
      />
      {created ? (
        <Alert>
          {isVideo
            ? "Estudio de eye tracking en video creado. Sube tu video MP4 o WebM aquí abajo y comparte la liga de participación."
            : "Estudio de eye tracking creado. Sube tus imágenes y comparte la liga de participación."}
        </Alert>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section id="study-invitation" className="glass-panel min-w-0 scroll-mt-4 space-y-4 rounded-lg p-5 sm:p-6" tabIndex={-1} aria-labelledby="study-invitation-title">
          <h2 id="study-invitation-title" className="text-lg font-bold">Participación</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">
              {runs ?? "—"}{runs !== null && study.max_responses ? ` de ${study.max_responses}` : ""} {runs === 1 && !study.max_responses ? "respuesta guardada" : "respuestas guardadas"}
            </span>
            {active ? <StatusBadge tone="warning">{active} en curso</StatusBadge> : null}
          </div>
          {study.max_responses && runs !== null ? (
            <progress aria-label="Respuestas guardadas" className="brand-progress h-2 w-full" value={Math.min(runs, study.max_responses)} max={study.max_responses} />
          ) : null}
          {isVideo && !hasVideoSource ? (
            <Alert tone="warning">Sube o vincula un video MP4/WebM antes de compartir la liga.</Alert>
          ) : null}
          {!isVideo && !assets.length ? <Alert tone="warning">Sube al menos una imagen antes de compartir la liga.</Alert> : null}
          {link ? (
            <>
              <CopyLink url={link} />
              <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "", "sm")}>
                Abrir vista previa sin guardar datos
              </a>
            </>
          ) : <Alert tone="warning">Este estudio no tiene liga de participación.</Alert>}
          <details className="border-t border-border pt-3">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Ajustes de participación</summary>
            <div className="space-y-3">
              <StudySettingsForm id={study.id} status={study.status} maxResponses={study.max_responses} closesAt={study.closes_at} duplicatePolicy={study.duplicate_policy} />
              <form action={regenerateLink}>
                <input type="hidden" name="id" value={study.id} />
                <Button type="submit" variant="secondary">Regenerar liga (invalida la actual)</Button>
              </form>
            </div>
          </details>
        </section>
        <section className="glass-panel min-w-0 space-y-4 rounded-lg p-5 sm:p-6" aria-labelledby="study-facts">
          <h2 id="study-facts" className="text-lg font-bold">Ficha del estudio</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Fact icon="clock" label="Exposición" value={isVideo ? `Hasta ${videoConfig?.maxDurationSeconds ?? 120} s` : `${config.eyeTracking.durationSeconds} s por imagen`} />
            <Fact icon="eye" label="Medición" value={facialCoding ? "Mirada y señales faciales" : "Mirada con cámara web"} />
            <Fact icon="lock" label="Privacidad" value="Video de cámara sin guardar" />
            <Fact icon="device" label="Validación" value="Calibración de la mirada" />
          </dl>
          <dl className="space-y-2 text-sm">
            <div><dt className="inline text-muted">Objetivo · </dt><dd className="inline">{config.objective}</dd></div>
            {config.brand ? <div><dt className="inline text-muted">Marca · </dt><dd className="inline">{config.brand}</dd></div> : null}
            {config.audience ? <div><dt className="inline text-muted">Público · </dt><dd className="inline">{config.audience}</dd></div> : null}
          </dl>
        </section>
      </div>

      {isVideo ? (
        <section className="glass-panel space-y-4 rounded-lg p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Video del estudio</h2>
          <VideoSetupCard
            studyId={study.id}
            r2Configured={r2Configured}
            maxDurationSeconds={videoConfig?.maxDurationSeconds}
            r2Key={videoConfig?.r2Key}
            playbackUrl={resolvedPlaybackUrl}
            title={videoConfig?.title}
            locked={Boolean(runs || active)}
          />
          {videoConfig?.scenes?.length ? (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold">Escenas configuradas ({videoConfig.scenes.length})</h3>
              <ul className="divide-y divide-border text-sm">
                {videoConfig.scenes.map((scene) => (
                  <li key={scene.id} className="flex items-center justify-between py-1.5">
                    <span>{scene.label}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {(scene.startMs / 1000).toFixed(0)}s – {(scene.endMs / 1000).toFixed(0)}s
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </section>
      ) : (
        <section className="glass-panel space-y-4 rounded-lg p-5 sm:p-6" aria-labelledby="study-stimuli">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="study-stimuli" className="text-lg font-bold">Estímulos</h2>
            <span className="text-sm text-muted tabular-nums">{assets.length} de 5 imágenes</span>
          </div>
          {runs || active ? (
            <Alert tone="info">Las imágenes ya no se pueden cambiar porque hay respuestas o sesiones en curso.</Alert>
          ) : (
            <AssetUploader studyId={study.id} withPlacement={false} />
          )}
          {assets.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map(({ row, aois }, index) => (
                <li key={row.id} className="min-w-0">
                  <Link href={`/studies/${study.id}/assets/${row.id}`} className="group block rounded-lg border border-border bg-surface/80 p-2 hover:border-accent-ink">
                    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-surface-muted">
                      {urls[row.storage_path] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
                        <img src={urls[row.storage_path]} alt="" className="size-full object-contain" />
                      ) : <span className="text-sm text-muted">Imagen no disponible</span>}
                      <span className="absolute top-2 left-2 rounded-full bg-deep px-2 py-1 text-xs font-semibold text-on-deep">Pieza {index + 1}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2 p-2">
                      <span className="min-w-0 break-words text-sm font-semibold">{row.title}</span>
                      <span className="shrink-0 text-xs text-muted group-hover:underline">Editar áreas ({aois.length})</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-control p-5 text-sm text-muted">Aún no hay imágenes.</p>
          )}
        </section>
      )}
    </div>
  );
}


function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface/80 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neuro-tint" aria-hidden="true">
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="text-sm font-semibold">{value}</dd>
      </div>
    </div>
  );
}
