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
import { eyeStudyConfigSchema } from "../config";

async function countActiveSessions(supabase: Awaited<ReturnType<typeof createClient>>, studyId: string) {
  const { count } = await supabase.from("sessions").select("id", { count: "exact", head: true })
    .eq("study_id", studyId).eq("status", "started")
    .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());
  return count;
}

export async function EyeOverview({ study, projectName, created }: { study: StudyRow; projectName: string | null; created: boolean }) {
  const config = eyeStudyConfigSchema.parse(study.config);
  const supabase = await createClient();
  const assets = await loadAssets(supabase, study.id);
  const urls = await assetUrls(supabase, assets.map((a) => a.row.storage_path), "thumb");
  const { count: runs } = await supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", study.id);
  const active = await countActiveSessions(supabase, study.id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const link = study.access_token ? magicLinkUrl(host ? `${proto}://${host}` : publicEnv().appUrl, study.access_token) : null;

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} active="overview" variant="eye" subtitle="Medición de mirada con participantes" />
      {created ? <Alert>Estudio de eye tracking creado. Sube tus imágenes y comparte la liga de participación.</Alert> : null}
      <Card className="space-y-2">
        <p className="text-sm"><span className="text-muted">Objetivo:</span> {config.objective}</p>
        {config.brand ? <p className="text-sm text-muted">Marca: {config.brand}</p> : null}
        {config.audience ? <p className="text-sm text-muted">Público: {config.audience}</p> : null}
      </Card>
      <Block className="space-y-4">
        <h2 className="text-xl font-semibold">Participantes con webcam</h2>
        <p className="text-sm text-muted">
          Cada persona calibra su mirada y observa las imágenes durante {config.eyeTracking.durationSeconds} segundos cada una.
          Se guardan coordenadas y calidad de medición; nunca video. Respuestas guardadas: {runs ?? 0}.
        </p>
        {!assets.length ? <Alert tone="warning">Sube al menos una imagen antes de compartir la liga.</Alert> : null}
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
    </div>
  );
}
