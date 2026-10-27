import Link from "next/link";
import { headers } from "next/headers";
import { CopyLink } from "@/components/copy-link";
import { StudySettingsForm } from "@/components/study-settings-form";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { StudyRow } from "@/lib/db/types";
import { publicEnv } from "@/lib/env";
import { magicLinkUrl } from "@/lib/magic-link";
import { createClient } from "@/lib/supabase/server";
import { visualConfigSchema } from "../config";
import { getPlacement } from "../engine/placements";
import { assetUrls, loadAssets, type VisualAsset } from "../results";
import { AssetUploader } from "./uploader";
import { regenerateLink } from "@/app/(app)/studies/[id]/actions";
import { Button } from "@/components/ui/button";

function Thumb({ studyId, asset, url, plain = false }: { studyId: string; asset: VisualAsset; url?: string; plain?: boolean }) {
  const { row } = asset;
  const Frame = plain ? PlainFrame : Card;
  return (
    <Link href={`/studies/${studyId}/assets/${row.id}`} className="group block">
      <Frame className={plain ? "space-y-1.5" : "h-full space-y-2 p-3 transition group-hover:border-primary"}>
        <div className={`relative aspect-[4/3] overflow-hidden rounded bg-foreground/5 ${plain ? "ring-1 ring-border transition group-hover:ring-2 group-hover:ring-heading" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage */}
          {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain object-top" loading="lazy" /> : null}
        </div>
        <p className="truncate text-sm font-medium">{row.title}</p>
        <p className="text-xs text-muted">
          {row.width}×{row.height}
          {getPlacement(row.placement) ? ` · ${getPlacement(row.placement)?.label}` : ""}
        </p>
        <p className="text-xs">
          {asset.ai ? <span className="text-success">Analizada</span> : <span className="text-muted">Sin analizar</span>}
          {row.aois_source === "analyst" ? " · AOI revisadas" : ""}
        </p>
      </Frame>
    </Link>
  );
}

function PlainFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

async function countActiveEyeSessions(supabase: Awaited<ReturnType<typeof createClient>>, studyId: string) {
  const { count } = await supabase.from("sessions").select("id", { count: "exact", head: true })
    .eq("study_id", studyId).eq("status", "started")
    .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());
  return count;
}

export async function VisualOverview({ study, projectName, created }: { study: StudyRow; projectName: string | null; created: boolean }) {
  const supabase = await createClient();
  const parsed = visualConfigSchema.safeParse(study.config);
  if (!parsed.success) {
    return (
      <div className="space-y-6">
        <StudyHeader study={study} projectName={projectName} active="overview" variant="pieces" />
        <Alert tone="warning">La configuración guardada de este estudio no es válida.</Alert>
      </div>
    );
  }
  const config = parsed.data;
  const assets = await loadAssets(supabase, study.id);
  const urls = await assetUrls(supabase, assets.map((a) => a.row.storage_path), "thumb");

  if (config.mode === "pieces") {
    const eye = Boolean(config.eyeTracking);
    const h = eye ? await headers() : null;
    const host = h?.get("x-forwarded-host") ?? h?.get("host");
    const proto = h?.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const link = eye && study.access_token ? magicLinkUrl(host ? `${proto}://${host}` : publicEnv().appUrl, study.access_token) : null;
    const { count: runs } = eye
      ? await supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", study.id)
      : { count: null };
    const active = eye ? await countActiveEyeSessions(supabase, study.id) : null;
    return (
      <div className="space-y-8">
        <StudyHeader study={study} projectName={projectName} active="overview" variant={eye ? "eye" : "pieces"} subtitle={eye ? "Eye tracking con webcam" : "Piezas gráficas"} />
        {created ? <Alert>Estudio creado. Sube las piezas que quieres evaluar.</Alert> : null}
        <Card className="space-y-2">
          <p className="text-sm">
            <span className="text-muted">Objetivo:</span> {config.objective}
          </p>
          {config.brand || config.audience ? (
            <p className="text-sm text-muted">
              {config.brand ? `Marca: ${config.brand}` : ""}
              {config.brand && config.audience ? " · " : ""}
              {config.audience ? `Público: ${config.audience}` : ""}
            </p>
          ) : null}
        </Card>
        {eye ? (
          <Card className="space-y-4">
            <h2 className="font-medium">Participantes con webcam</h2>
            <p className="text-sm text-muted">
              Cada persona calibra su cámara y mira las piezas durante {config.eyeTracking?.durationSeconds} segundos cada una.
              Se guardan coordenadas de mirada y calidad de medición; nunca video. Respuestas guardadas: {runs ?? 0}.
            </p>
            {assets.length === 0 ? <Alert tone="warning">Sube al menos una pieza antes de compartir la liga.</Alert> : null}
            {link ? (
              <>
                <CopyLink url={link} />
                <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-heading underline underline-offset-4">
                  Abrir vista previa sin guardar datos ↗
                </a>
              </>
            ) : <Alert tone="warning">Este estudio no tiene liga de participación.</Alert>}
            <StudySettingsForm id={study.id} status={study.status} maxResponses={study.max_responses} closesAt={study.closes_at} duplicatePolicy={study.duplicate_policy} />
            <form action={regenerateLink}>
              <input type="hidden" name="id" value={study.id} />
              <Button type="submit" variant="secondary">Regenerar liga (invalida la actual)</Button>
            </form>
          </Card>
        ) : null}
        <Card className="space-y-3">
          <div>
            <h2 className="font-medium">Subir piezas</h2>
            <p className="text-sm text-muted">PNG, JPEG o WebP de hasta 10 MB. {eye ? "Máximo 5 piezas; quedan fijadas tras la primera respuesta." : "Elige el formato para revisar tamaño, proporción y peso."}</p>
          </div>
          {eye && (runs || active)
            ? <Alert tone="info">Las piezas ya no se pueden cambiar porque hay respuestas o sesiones en curso.</Alert>
            : <AssetUploader studyId={study.id} withPlacement={!eye} />}
        </Card>
        {assets.length === 0 ? (
          <Card className="text-sm text-muted">Aún no hay piezas.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <Thumb key={a.row.id} studyId={study.id} asset={a} url={urls[a.row.storage_path]} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} active="overview" variant="journey" subtitle="Journey web + IFD" />
      {created ? <Alert>Estudio creado. Sube las capturas de cada tarea por sitio (modo asistido: recorre el sitio con tu navegador y captura cada paso).</Alert> : null}
      {config.remeasurementOf ? (
        <Alert>
          Re-medición de <Link href={`/studies/${config.remeasurementOf}/results`} className="underline">otro estudio</Link>. Las calificaciones se hacen de nuevo desde cero.
        </Alert>
      ) : null}
      <Card className="space-y-1 text-sm">
        <p>
          <span className="text-muted">Objetivo:</span> {config.objective}
        </p>
        {config.productTarget ? (
          <p>
            <span className="text-muted">Producto objetivo:</span> {config.productTarget}
          </p>
        ) : null}
      </Card>
      {config.sites.map((site) => (
        <section key={site.key} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">
              {site.name} <span className="text-sm font-normal text-muted">{site.competitor ? "· competidor" : "· principal"}</span>
            </h2>
            <a href={site.url} target="_blank" rel="noreferrer" className="inline-block break-all py-1 text-sm text-heading underline underline-offset-4">
              {site.url} ↗
            </a>
          </div>
          <div className="space-y-3">
            {config.tasks.map((task) => {
              const items = assets.filter((a) => a.row.site_key === site.key && a.row.task_id === task.id);
              return (
                <Card key={task.id} className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      {task.id} · {task.name}
                    </p>
                    <p className="text-xs text-muted">{task.instruction}</p>
                  </div>
                  {items.length ? (
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((a) => (
                        <Thumb key={a.row.id} studyId={study.id} asset={a} url={urls[a.row.storage_path]} plain />
                      ))}
                    </div>
                  ) : null}
                  <AssetUploader studyId={study.id} siteKey={site.key} taskId={task.id} compact />
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
