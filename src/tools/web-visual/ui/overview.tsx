import Link from "next/link";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Block, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { StudyRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { primaryFindings } from "@/tools/visual/analysis/findings";
import { getPlacement } from "@/tools/visual/engine/placements";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import { AssetAnalysisBatch } from "@/tools/visual/ui/asset-analysis-batch";
import { AssetUploader } from "@/tools/visual/ui/uploader";
import {
  WEB_DEVICE_FOCUS_LABEL,
  WEB_PAGE_TYPE_LABEL,
  webVisualConfigSchema,
} from "../config";

export async function WebVisualOverview({
  study,
  projectName,
  created,
}: {
  study: StudyRow;
  projectName: string | null;
  created: boolean;
}) {
  const parsed = webVisualConfigSchema.safeParse(study.config);
  if (!parsed.success) notFound();
  const config = parsed.data;

  const supabase = await createClient();
  const assets = await loadAssets(supabase, study.id);
  const urls = await assetUrls(
    supabase,
    assets.map((a) => a.row.storage_path),
    "thumb",
  );
  const batchAssets = assets.map((a) => {
    const findings = a.ai ? primaryFindings(a.ai.result, a.aois) : null;
    return {
      id: a.row.id,
      title: a.row.title,
      thumbUrl: urls[a.row.storage_path],
      width: a.row.width,
      height: a.row.height,
      analyzed: !!a.ai,
      reviewed: a.row.aois_source === "analyst",
      placement: getPlacement(a.row.placement)?.label,
      strength: findings?.strengths[0],
      weakness: findings?.weaknesses[0]?.problem,
    };
  });

  const weaknesses = assets.flatMap((a) => {
    const f = a.ai ? primaryFindings(a.ai.result, a.aois) : null;
    return (f?.weaknesses ?? []).map((w) => ({
      assetId: a.row.id,
      assetTitle: a.row.title,
      ...w,
    }));
  });

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="overview"
        variant="pieces"
        subtitle={`${WEB_PAGE_TYPE_LABEL[config.pageType]} · ${WEB_DEVICE_FOCUS_LABEL[config.deviceFocus]}`}
      />

      {created ? (
        <Alert>
          Estudio web creado. Sube las capturas de pantalla del sitio para
          iniciar el análisis UX.
        </Alert>
      ) : null}

      <Card className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Objetivo de la página</p>
          <p className="mt-0.5 font-medium">{config.objective}</p>
        </div>
        <div>
          <p className="text-xs text-muted">CTA principal esperado</p>
          <p className="mt-0.5 font-medium">
            {config.primaryCta || "No especificado"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Modo</p>
          <p className="mt-0.5 font-medium">
            {config.mode === "flow"
              ? "Flujo de pantallas"
              : "Capturas individuales"}
          </p>
        </div>
      </Card>

      <Block className="space-y-3">
        <div>
          <SectionTitle icon="image">Subir capturas del sitio</SectionTitle>
          <p className="text-sm text-muted">
            Opcionalmente elige un formato web (desktop o móvil) y sube
            capturas PNG, JPEG o WebP de hasta 10 MB.
          </p>
        </div>
        <AssetUploader studyId={study.id} withPlacement={false} />
      </Block>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon="eye">
            Capturas cargadas ({assets.length})
          </SectionTitle>
        </div>

        {assets.length === 0 ? (
          <EmptyState icon="image" title="Aún no hay capturas web">
            Sube al menos una captura de pantalla (PNG, JPG o WebP) para
            calcular métricas de imagen y ejecutar el análisis UX/CRO.
          </EmptyState>
        ) : (
          <>
            <AssetAnalysisBatch studyId={study.id} assets={batchAssets} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset, index) => {
                const { row } = asset;
                const url = urls[row.storage_path];
                return (
                  <li key={row.id}>
                    <Link
                      href={`/studies/${study.id}/assets/${row.id}`}
                      className="group block"
                    >
                      <Card className="h-full space-y-2 p-3 transition group-hover:border-primary">
                        <div
                          className="relative mx-auto overflow-hidden rounded bg-foreground/5"
                          style={{
                            aspectRatio:
                              row.width && row.height
                                ? `${row.width} / ${row.height}`
                                : "4/3",
                            maxHeight: "240px",
                            width: "100%",
                          }}
                        >
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage
                            <img
                              src={url}
                              alt=""
                              className="size-full object-contain"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <p className="truncate text-sm font-medium">
                          {config.mode === "flow" ? `${index + 1}. ` : ""}
                          {row.title}
                        </p>
                        <p className="text-xs text-muted">
                          {row.width}×{row.height}
                          {getPlacement(row.placement)
                            ? ` · ${getPlacement(row.placement)?.label}`
                            : ""}
                        </p>
                        <p className="text-xs">
                          {asset.ai ? (
                            <span className="text-success">Analizada</span>
                          ) : (
                            <span className="text-muted">Sin analizar</span>
                          )}
                        </p>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {weaknesses.length > 0 ? (
        <Block title="Hallazgos prioritarios">
          <ul className="space-y-2 text-sm">
            {weaknesses.slice(0, 6).map((w, i) => (
              <li
                key={`${w.assetId}-${i}`}
                className="rounded-md border border-border p-3"
              >
                <p className="font-medium">
                  {w.assetTitle} · {w.problem}
                </p>
                <p className="mt-1 text-xs text-muted">{w.recommendation}</p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}
