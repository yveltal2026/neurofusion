import Link from "next/link";
import { EyeAoiEditor } from "@/tools/eyetracking/ui/aoi-editor";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import type { VisualAssetRow } from "@/lib/db/types";
import { deleteAsset, restoreAiAois } from "@/tools/visual/actions";
import { getPlacement } from "@/tools/visual/engine/placements";
import { loadVisualStudyPage } from "@/tools/visual/load";
import { assetUrls, toVisualAsset } from "@/tools/visual/results";
import {
  AiSummary,
  AllStrengths,
  BlindZones,
  CriteriaScores,
  FormatChecks,
  formatStatus,
  ImageMetrics,
  IssuesList,
  Limitations,
  TextContrast,
  TopFindings,
} from "@/tools/visual/ui/asset-panels";
import { AttentionViewer } from "@/tools/visual/ui/attention-viewer";
import { AnalyzeAssetForm, AssetMetaForm } from "@/tools/visual/ui/forms";
import { PredictedEyeMetrics } from "@/tools/visual/ui/predicted-eye-metrics";

export const metadata = { title: "Pieza · Laboratorio Digital" };
// El análisis de visión con IA puede tardar.
export const maxDuration = 120;

export default async function AssetPage({ params }: PageProps<"/studies/[id]/assets/[assetId]">) {
  const { id, assetId } = await params;
  const { supabase } = await requireUser();
  const { study, config, projectName } = await loadVisualStudyPage(supabase, id, undefined, true);
  const { data: row } = await supabase.from("visual_assets").select("*").eq("id", assetId).eq("study_id", id).maybeSingle<VisualAssetRow>();
  if (!row) notFound();
  const asset = toVisualAsset(row);
  const url = (await assetUrls(supabase, [row.storage_path], "view"))[row.storage_path];
  const site = config.mode === "journey" ? config.sites.find((s) => s.key === row.site_key) : null;
  const task = config.mode === "journey" ? config.tasks.find((t) => t.id === row.task_id) : null;

  if (config.mode === "pieces" && config.eyeTracking) {
    return (
      <div className="space-y-6">
        <StudyHeader study={study} projectName={projectName} active="overview" variant="eye" subtitle={row.title} />
        <Link href={`/studies/${id}`} className="inline-block py-1 text-sm text-muted hover:underline">
          ← Volver a las imágenes del estudio
        </Link>
        <h2 className="text-xl font-semibold">{row.title}</h2>
        {url ? (
          <EyeAoiEditor studyId={id} assetId={assetId} imageUrl={url} width={row.width} height={row.height} initial={asset.aois} />
        ) : (
          <Alert tone="error">No se pudo obtener la imagen del almacenamiento.</Alert>
        )}
        <Link href={`/studies/${id}/eye`} className="inline-block text-sm font-medium text-heading underline underline-offset-4">
          Consultar miradas y mapas de atención
        </Link>
        <Card className="max-w-xl space-y-3">
          <AssetMetaForm studyId={id} assetId={assetId} title={row.title} placement={null} withPlacement={false} />
          <p className="text-xs text-muted">
            {row.file_name} · {row.width}×{row.height} · {(row.bytes / 1024).toFixed(0)} KB
          </p>
          <form action={deleteAsset}>
            <input type="hidden" name="studyId" value={id} />
            <input type="hidden" name="assetId" value={assetId} />
            <Button type="submit" variant="ghost" className="text-danger">
              Eliminar imagen
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const variant = config.mode === "journey" ? "journey" : "pieces";
  const placementSpec = getPlacement(row.placement);
  const imgData = { width: row.width, height: row.height, bytes: row.bytes, placement: row.placement };
  const fmtStatus = formatStatus(imgData);
  const issuesCount = asset.ai?.result.issues.length ?? 0;
  const backLabel = config.mode === "journey" ? "← Volver a las capturas" : "← Volver a las piezas";

  const tabs: TabItem[] = [
    {
      id: "ai",
      label: "Diagnóstico",
      count: issuesCount || undefined,
      content: asset.ai ? (
        <div className="space-y-8">
          <CriteriaScores result={asset.ai.result} />
          <AiSummary result={asset.ai.result} />
          <TopFindings result={asset.ai.result} aois={asset.aois} />
          {asset.ai.result.strengths.length > 3 ? (
            <AllStrengths result={asset.ai.result} from={3} title="Otros aciertos identificados" />
          ) : null}
          <IssuesList result={asset.ai.result} />
          <BlindZones aois={asset.aois} />
          <Limitations result={asset.ai.result} />
          <p className="text-xs text-muted">
            {new Date(asset.ai.generatedAt ?? row.created_at).toLocaleString("es-MX")} · {asset.ai.provider} · {asset.ai.model} · {asset.ai.engineVersion}
            {asset.ai.tiles > 1 ? ` · ${asset.ai.tiles} franjas (${Math.round(asset.ai.coverage * 100)} % de la altura)` : ""}
          </p>
        </div>
      ) : (
        <Card className="space-y-3">
          <h3 className="text-base font-semibold text-heading">Aún no se ha analizado esta imagen con IA</h3>
          <p className="text-sm text-muted">
            La IA identificará los elementos principales, propondrá el recorrido visual, estimará la atención de cada área y
            calificará seis criterios clave: claridad, jerarquía visual, acción, legibilidad, presencia de marca y carga visual.
          </p>
          <AnalyzeAssetForm studyId={id} assetId={assetId} hasAnalysis={false} />
        </Card>
      ),
    },
    {
      id: "predictions",
      label: "Atención",
      count: asset.aois.length || undefined,
      content: asset.ai ? (
        <div className="space-y-4">
          <PredictedEyeMetrics result={asset.ai.result} aois={asset.aois} analyzedAois={asset.ai.aois} asset={{ id: row.id, title: row.title }} />
        </div>
      ) : (
        <Card className="space-y-2 text-sm text-muted">
          <p className="font-medium text-heading">Predicciones de atención no disponibles</p>
          <p>Para estimar tiempos hasta la primera fijación (TTFF), conteo de fijaciones y tasas de atención por área, primero analiza la imagen con IA.</p>
        </Card>
      ),
    },
    {
      id: "pixels",
      label: "Formato",
      content: (
        <div className="space-y-6">
          <FormatChecks img={imgData} />
          {asset.metrics ? <TextContrast metrics={asset.metrics} /> : null}
          {asset.metrics ? (
            <ImageMetrics metrics={asset.metrics} />
          ) : (
            <Card className="text-sm text-muted">No se pudieron calcular las métricas deterministas de píxeles.</Card>
          )}
        </div>
      ),
    },
    {
      id: "details",
      label: "Edición",
      content: (
        <div className="space-y-6">
          <Card className="space-y-3">
            <h3 className="text-base font-semibold text-heading">Editar información</h3>
            <AssetMetaForm
              studyId={id}
              assetId={assetId}
              title={row.title}
              placement={row.placement}
              withPlacement
              requirePlacement={config.mode === "pieces"}
            />
          </Card>
          <Card className="space-y-2 text-sm">
            <h3 className="font-semibold text-heading">Archivo original</h3>
            <dl className="space-y-1 text-xs text-muted">
              <div className="flex justify-between gap-2">
                <dt>Nombre</dt>
                <dd className="font-medium text-foreground">{row.file_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Dimensiones</dt>
                <dd className="tabular-nums text-foreground">{row.width}×{row.height} px</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Peso</dt>
                <dd className="tabular-nums text-foreground">{(row.bytes / 1024).toFixed(0)} KB</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Subida</dt>
                <dd className="text-foreground">{new Date(row.created_at).toLocaleString("es-MX")}</dd>
              </div>
              <div className="pt-1">
                <dt>SHA-256</dt>
                <dd className="break-all font-mono text-[11px] text-foreground">{row.sha256}</dd>
              </div>
            </dl>
          </Card>
          <Card className="space-y-2 border-danger/30">
            <h3 className="text-sm font-semibold text-danger">Eliminar imagen</h3>
            <p className="text-xs text-muted">
              Esta acción elimina la pieza, su análisis con IA y las áreas de interés asociadas. No se puede deshacer.
            </p>
            <form action={deleteAsset}>
              <input type="hidden" name="studyId" value={id} />
              <input type="hidden" name="assetId" value={assetId} />
              <Button type="submit" variant="ghost" size="sm" className="text-danger hover:bg-danger/10">
                Eliminar imagen definitivamente
              </Button>
            </form>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="overview"
        variant={variant}
        subtitle={site && task ? `${site.name} · ${task.id} ${task.name}` : row.title}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <Link href={`/studies/${id}`} className="inline-block text-sm text-muted hover:text-heading hover:underline">
          {backLabel}
        </Link>
        <AnalyzeAssetForm studyId={id} assetId={assetId} hasAnalysis={Boolean(asset.ai)} />
      </div>

      <header className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-heading md:text-3xl">{row.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {placementSpec ? (
            <span className="font-medium text-foreground">{placementSpec.label}</span>
          ) : (
            <span className="text-muted">Sin formato asignado</span>
          )}
          <span className="text-muted">·</span>
          <span className="tabular-nums text-muted">{row.width}×{row.height} px</span>
          <span className="text-muted">·</span>
          <span className="tabular-nums text-muted">{(row.bytes / 1024).toFixed(0)} KB</span>
          {fmtStatus ? (
            <StatusBadge tone={fmtStatus.passed === fmtStatus.total ? "success" : "warning"}>
              {fmtStatus.passed === fmtStatus.total ? "Cumple formato" : `${fmtStatus.passed}/${fmtStatus.total} en formato`}
            </StatusBadge>
          ) : null}
          <StatusBadge tone={asset.ai ? "success" : "neutral"}>
            {asset.ai ? "Analizada con IA" : "Sin analizar"}
          </StatusBadge>
          {row.aois_source === "analyst" ? <StatusBadge tone="neutral">AOI revisadas</StatusBadge> : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
        {/* Columna izquierda: visor interactivo contenido y fijo en pantalla */}
        <div className="space-y-3 lg:sticky lg:top-4 self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-0.5">
          {url ? (
            <AttentionViewer
              key={`${row.ai_generated_at}-${row.aois_reviewed_at}-${row.aois_source}`}
              imageUrl={url}
              width={row.width}
              height={row.height}
              aois={asset.aois}
              studyId={id}
              assetId={assetId}
              editable
              initialMode={asset.aois.length ? "heatmap" : "original"}
              reviewed={row.aois_source === "analyst"}
              maxHeight="min(70vh, 640px)"
            />
          ) : (
            <Alert tone="error">No se pudo obtener la imagen del almacenamiento.</Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>
              Áreas de interés:{" "}
              {row.aois_source === "analyst"
                ? `revisadas por el analista (${new Date(row.aois_reviewed_at ?? row.created_at).toLocaleString("es-MX")})`
                : row.aois_source === "ai"
                  ? "propuestas por la IA, sin revisar"
                  : "sin definir (analiza con IA o dibújalas en «Áreas de interés»)"}
            </span>
            {row.aois_source === "analyst" && asset.ai ? (
              <form action={restoreAiAois}>
                <input type="hidden" name="studyId" value={id} />
                <input type="hidden" name="assetId" value={assetId} />
                <button type="submit" className="py-1 text-heading underline underline-offset-4">
                  Restaurar la propuesta de la IA
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {/* Columna derecha: Pestañas con diagnóstico, atención, formato y edición */}
        <div className="min-w-0">
          <Tabs
            label="Secciones del análisis"
            items={tabs}
            defaultTab="ai"
            variant="segmented"
            gridColumns="minmax(0, 1.45fr) minmax(0, 1.05fr) minmax(0, 0.75fr) minmax(0, 0.75fr)"
          />
        </div>
      </div>
    </div>
  );
}
