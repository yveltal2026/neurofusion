import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Block, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { StudyRow, WebEyetrackingRunRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { webEyetrackingConfigSchema } from "../config";
import {
  computeWebEyetrackingAggregate,
  stepEventSchema,
  type WebStepEvent,
} from "../engine/metrics";
import { rawWebGazeSampleSchema, type RawWebGazeSample } from "../engine/normalize";

export async function WebEyetrackingOverview({
  study,
  projectName,
  link,
  origin,
  created,
}: {
  study: StudyRow;
  projectName: string | null;
  link: string;
  origin: string;
  created: boolean;
}) {
  const parsed = webEyetrackingConfigSchema.safeParse(study.config);
  if (!parsed.success) notFound();
  const config = parsed.data;

  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("web_eyetracking_runs")
    .select("*")
    .eq("study_id", study.id)
    .order("created_at", { ascending: false })
    .returns<WebEyetrackingRunRow[]>();

  const parsedRuns = (runs ?? []).map((r) => {
    const stepEvents: WebStepEvent[] = Array.isArray(r.step_events)
      ? r.step_events.flatMap((e) => {
          const p = stepEventSchema.safeParse(e);
          return p.success ? [p.data] : [];
        })
      : [];
    const samples: RawWebGazeSample[] = Array.isArray(r.samples)
      ? r.samples.flatMap((s) => {
          const p = rawWebGazeSampleSchema.safeParse(s);
          return p.success ? [p.data] : [];
        })
      : [];
    return { stepEvents, samples };
  });

  const aggregate = computeWebEyetrackingAggregate(
    parsedRuns,
    config.steps.map((s) => s.id),
  );

  const snippet = `<script src="${origin.replace(/\/+$/, "")}/api/embed/web-eyetrack.js" data-study="${study.id}" async></script>`;

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        subtitle={
          config.mode === "live_snippet"
            ? "Sitio en vivo (snippet en <head>)"
            : "Sin código (capturas web con scroll)"
        }
      />

      {created ? (
        <Alert>
          Estudio de Eyetracking Web creado. Comparte la liga mágica con tus
          participantes
          {config.mode === "live_snippet"
            ? " e instala el snippet en el <head> del sitio objetivo."
            : "."}
        </Alert>
      ) : null}

      <Card className="space-y-4">
        <SectionTitle icon="link">Liga para participantes</SectionTitle>
        <CopyLink url={link} />
        <p className="text-xs text-muted">
          URL objetivo: <span className="font-medium text-heading">{config.targetUrl}</span>
        </p>
      </Card>

      {config.mode === "live_snippet" ? (
        <Block className="space-y-3">
          <SectionTitle icon="search">
            Código para insertar en &lt;head&gt; (o Google Tag Manager)
          </SectionTitle>
          <p className="text-sm text-muted">
            Pega esta etiqueta dentro del <code>&lt;head&gt;</code> de tu sitio.
            Solo aceptará telemetría desde los orígenes autorizados:{" "}
            <span className="font-medium text-heading">
              {config.allowedOrigins.join(", ") || config.targetUrl}
            </span>
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface-muted p-3 text-xs">
            <code>{snippet}</code>
          </pre>
        </Block>
      ) : (
        <Alert>
          Modo sin código activo: los participantes navegarán las pantallas
          configuradas dentro de Aesteros con scroll vertical y calibración de
          webcam sin requerir cambios en el sitio destino.
        </Alert>
      )}

      <Block className="space-y-3">
        <SectionTitle icon="eye">
          Pasos configurados ({config.steps.length})
        </SectionTitle>
        <ol className="space-y-2 text-sm">
          {config.steps.map((step, i) => {
            const metric = aggregate.steps.find((m) => m.stepId === step.id);
            return (
              <li
                key={step.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {i + 1}. {step.title}{" "}
                    <span className="text-xs text-muted">({step.id})</span>
                  </p>
                  <p className="text-xs text-muted">{step.instruction}</p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>
                    Completitud:{" "}
                    <span className="font-semibold text-heading">
                      {metric && metric.attempts > 0
                        ? `${Math.round(metric.completionRate * 100)}%`
                        : "—"}
                    </span>
                  </p>
                  <p>
                    Tiempo medio:{" "}
                    {metric?.meanDurationMs != null
                      ? `${(metric.meanDurationMs / 1000).toFixed(1)} s`
                      : "—"}
                  </p>
                  <p>
                    Muestras de mirada: {metric?.gazeCount ?? 0} · Clics:{" "}
                    {metric?.clickCount ?? 0}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Block>

      {aggregate.totalRuns === 0 ? (
        <EmptyState icon="eye" title="Sin sesiones completadas todavía">
          Comparte la liga mágica con participantes para empezar a registrar
          miradas, desplazamiento y cumplimiento por paso.
        </EmptyState>
      ) : (
        <Card className="space-y-2 text-sm">
          <p className="font-medium">
            Sesiones registradas: {aggregate.totalRuns}
          </p>
          <p className="text-xs text-muted">
            Las coordenadas de mirada están normalizadas al documento completo
            compensando scroll vertical y tamaño de viewport.
          </p>
        </Card>
      )}
    </div>
  );
}
