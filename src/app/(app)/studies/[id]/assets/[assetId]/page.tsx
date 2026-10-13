import Link from "next/link";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { VisualAssetRow } from "@/lib/db/types";
import { deleteAsset, restoreAiAois } from "@/tools/visual/actions";
import { loadVisualStudyPage } from "@/tools/visual/load";
import { signedUrls, toVisualAsset } from "@/tools/visual/results";
import { AiReading, MetricsPanel } from "@/tools/visual/ui/asset-panels";
import { AttentionViewer } from "@/tools/visual/ui/attention-viewer";
import { AnalyzeAssetForm, AssetMetaForm } from "@/tools/visual/ui/forms";

export const metadata = { title: "Pieza · NeuroFusion" };
// El análisis de visión con IA puede tardar.
export const maxDuration = 120;

export default async function AssetPage({ params }: PageProps<"/studies/[id]/assets/[assetId]">) {
  const { id, assetId } = await params;
  const { supabase } = await requireUser();
  const { study, config, projectName } = await loadVisualStudyPage(supabase, id);
  const { data: row } = await supabase.from("visual_assets").select("*").eq("id", assetId).eq("study_id", id).maybeSingle<VisualAssetRow>();
  if (!row) notFound();
  const asset = toVisualAsset(row);
  const url = (await signedUrls(supabase, [row.storage_path]))[row.storage_path];
  const site = config.mode === "journey" ? config.sites.find((s) => s.key === row.site_key) : null;
  const task = config.mode === "journey" ? config.tasks.find((t) => t.id === row.task_id) : null;
  const variant = config.mode === "journey" ? "journey" : "pieces";

  return (
    <div className="space-y-6">
      <StudyHeader study={study} projectName={projectName} active="overview" variant={variant} subtitle={site && task ? `${site.name} · ${task.id} ${task.name}` : row.title} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{row.title}</h2>
        <Link href={`/studies/${id}`} className="text-sm text-muted hover:underline">
          ← Volver
        </Link>
      </div>

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
        />
      ) : (
        <Alert tone="error">No se pudo obtener la imagen del almacenamiento.</Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
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
            <button type="submit" className="text-primary hover:underline">
              Restaurar la propuesta de la IA
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <AnalyzeAssetForm studyId={id} assetId={assetId} hasAnalysis={Boolean(asset.ai)} />
          {asset.ai ? (
            <>
              <p className="text-xs text-muted">
                {new Date(asset.ai.generatedAt ?? row.created_at).toLocaleString("es-MX")} · {asset.ai.provider} · {asset.ai.model} · {asset.ai.engineVersion}
                {asset.ai.tiles > 1 ? ` · ${asset.ai.tiles} franjas (${Math.round(asset.ai.coverage * 100)} % de la altura)` : ""}
              </p>
              <AiReading result={asset.ai.result} aois={asset.aois} />
            </>
          ) : (
            <Card className="text-sm text-muted">
              La IA identifica los elementos, estima su atracción e importancia, propone el recorrido visual y califica claridad, jerarquía, acción,
              legibilidad, marca y carga visual. Después puedes corregir las áreas de interés.
            </Card>
          )}
        </section>
        <aside className="space-y-4">
          {asset.metrics ? <MetricsPanel metrics={asset.metrics} img={{ width: row.width, height: row.height, bytes: row.bytes, placement: row.placement }} /> : null}
          <Card>
            <AssetMetaForm studyId={id} assetId={assetId} title={row.title} placement={row.placement} />
          </Card>
          <Card className="space-y-1 text-xs text-muted">
            <p>
              {row.file_name} · {row.width}×{row.height} · {(row.bytes / 1024).toFixed(0)} KB
            </p>
            <p className="break-all">SHA-256 {row.sha256}</p>
            <p>Subida {new Date(row.created_at).toLocaleString("es-MX")}</p>
          </Card>
          <form action={deleteAsset}>
            <input type="hidden" name="studyId" value={id} />
            <input type="hidden" name="assetId" value={assetId} />
            <Button type="submit" variant="ghost" className="text-red-600">
              Eliminar imagen
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}
