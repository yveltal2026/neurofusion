import Link from "next/link";
import { headers } from "next/headers";
import { CopyLink } from "@/components/copy-link";
import { StudyHeader } from "@/components/study-header";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Block, Card } from "@/components/ui/card";
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
  const assets = isVideo ? [] : await loadAssets(supabase, study.id);
  const urls = isVideo ? {} : await assetUrls(supabase, assets.map((a) => a.row.storage_path), "thumb");
  const { count: runs } = await supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", study.id);
  const active = await countActiveSessions(supabase, study.id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const link = study.access_token ? magicLinkUrl(host ? `${proto}://${host}` : publicEnv().appUrl, study.access_token) : null;
  const hasVideoSource = Boolean(videoConfig?.r2Key || videoConfig?.playbackUrl);

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="overview"
        variant="eye"
        subtitle={isVideo ? "Eye tracking en video + Facial Coding" : "Medición de mirada con participantes"}
      />
      {created ? (
        <Alert>
          {isVideo
            ? "Estudio de eye tracking en video creado. Sube tu video MP4 o WebM aquí abajo y comparte la liga de participación."
            : "Estudio de eye tracking creado. Sube tus imágenes y comparte la liga de participación."}
        </Alert>
      ) : null}
      <Card className="space-y-2">
        <div className="flex flex-wrap gap-2 pb-1">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
            {isVideo ? "Estímulo: Video" : "Estímulo: Imágenes (hasta 5)"}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
            {facialCoding ? "Facial Coding activo" : "Solo Eye Tracking"}
          </span>
        </div>
        <p className="text-sm"><span className="text-muted">Objetivo:</span> {config.objective}</p>
        {config.brand ? <p className="text-sm text-muted">Marca: {config.brand}</p> : null}
        {config.audience ? <p className="text-sm text-muted">Público: {config.audience}</p> : null}
      </Card>
      <Block className="space-y-4">
        <h2 className="text-xl font-semibold">Participantes con webcam</h2>
        <p className="text-sm text-muted">
          {isVideo
            ? `Cada persona calibra su mirada y línea base neutral (3 s) y observa el video (máx. ${videoConfig?.maxDurationSeconds ?? 120} s). Se guardan coordenadas, AUs faciales y calidad; el video de la cámara nunca se almacena. Respuestas guardadas: ${runs ?? 0}.`
            : `Cada persona calibra su mirada y observa las imágenes durante ${config.eyeTracking.durationSeconds} segundos cada una. Se guardan coordenadas y calidad de medición; nunca video. Respuestas guardadas: ${runs ?? 0}.`}
        </p>
        {isVideo && !hasVideoSource ? (
          <Alert tone="warning">Sube o vincula un video MP4/WebM antes de compartir la liga.</Alert>
        ) : null}
        {!isVideo && !assets.length ? <Alert tone="warning">Sube al menos una imagen antes de compartir la liga.</Alert> : null}
        {link ? (
          <>
            <CopyLink url={link} />
            <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-heading underline underline-offset-4">Abrir vista previa sin guardar datos ↗</a>
          </>
        ) : <Alert tone="warning">Este estudio no tiene liga de participación.</Alert>}
        <StudySettingsForm id={study.id} status={study.status} maxResponses={study.max_responses} closesAt={study.closes_at} duplicatePolicy={study.duplicate_policy} />
        <form action={regenerateLink}>
          <input type="hidden" name="id" value={study.id} />
          <Button type="submit" variant="secondary">Regenerar liga (invalida la actual)</Button>
        </form>
      </Block>

      {isVideo ? (
        <Block className="space-y-4">
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
                    <span className="font-mono text-xs text-muted">
                      {(scene.startMs / 1000).toFixed(0)}s – {(scene.endMs / 1000).toFixed(0)}s
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </Block>
      ) : (
        <>
          <Block className="space-y-3">
            <h2 className="text-xl font-semibold">Imágenes del estudio</h2>
            <p className="text-sm text-muted">PNG, JPEG o WebP de hasta 10 MB. Máximo 5 imágenes; quedan fijadas tras la primera respuesta.</p>
            {runs || active ? <Alert tone="info">Las imágenes ya no se pueden cambiar porque hay respuestas o sesiones en curso.</Alert> : <AssetUploader studyId={study.id} withPlacement={false} />}
          </Block>
          {assets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map(({ row }, i) => (
                <Link key={row.id} href={`/studies/${study.id}/assets/${row.id}`} className="block">
                  <Card className="h-full space-y-2 p-3 transition hover:border-primary">
                    {urls[row.storage_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
                      <img src={urls[row.storage_path]} alt={row.title} className="aspect-[4/3] w-full object-contain" />
                    ) : null}
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted">Imagen {i + 1} · {row.width}×{row.height} · {config.eyeTracking.durationSeconds} s</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : <Card className="text-sm text-muted">Aún no hay imágenes.</Card>}
        </>
      )}
    </div>
  );
}
