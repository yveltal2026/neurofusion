import { RowLink, RowList } from "@/components/ui/rows";
import { ScoreTrendChart } from "@/components/charts/seo-charts";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Block } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { EmptyState } from "@/components/ui/empty-state";
import type { SeoAuditRow, StudyRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { seoConfigSchema } from "../config";
import { SEVERITY_LABEL, type AuditSummary } from "../engine";
import { LiveAuditForm, UploadAuditForm } from "./forms";
import { SeverityBadge } from "./findings-table";

const date = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export async function SeoOverview({
  study,
  projectName,
  created,
}: {
  study: StudyRow;
  projectName: string | null;
  created: boolean;
}) {
  const supabase = await createClient();
  const config = seoConfigSchema.safeParse(study.config);
  const { data } = await supabase
    .from("seo_audits")
    .select(
      "id, mode, site_url, engine_version, summary, pages, findings, created_at, ai_generated_at",
    )
    .eq("study_id", study.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<
      Pick<
        SeoAuditRow,
        | "id"
        | "mode"
        | "site_url"
        | "engine_version"
        | "summary"
        | "pages"
        | "findings"
        | "created_at"
        | "ai_generated_at"
      >[]
    >();
  const audits = data ?? [];
  // Sólo la serie reciente que conserva modo, versión, objetivos y evaluaciones.
  const seriesKey = (a: (typeof audits)[number]) => {
    const summary = a.summary as AuditSummary;
    if (!summary.scope) return null;
    return JSON.stringify([
      a.mode,
      a.site_url,
      a.engine_version,
      summary.scoreVersion,
      summary.scope,
      (
        (Array.isArray(a.pages)
          ? a.pages
          : []) as import("../engine").PageSummary[]
      )
        .map((p) => p.url)
        .sort(),
      (
        (Array.isArray(a.findings)
          ? a.findings
          : []) as import("../engine").Finding[]
      )
        .filter((f) => !f.advisory)
        .map((f) => JSON.stringify([f.rule, f.url]))
        .sort(),
    ]);
  };
  const latestKey = audits[0] ? seriesKey(audits[0]) : null;
  const recent = [] as typeof audits;
  for (const audit of audits) {
    if (!latestKey || seriesKey(audit) !== latestKey) break;
    recent.push(audit);
  }
  const trend = recent.reverse().map((a) => ({
    label: new Date(a.created_at).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
    }),
    score: (a.summary as AuditSummary).score,
  }));

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="overview"
        variant="seo"
      />
      {created ? (
        <Alert>Estudio creado. Lanza la primera auditoría.</Alert>
      ) : null}
      {!config.success ? (
        <Alert tone="warning">
          La configuración guardada no es válida. Revísala en Ajustes.
        </Alert>
      ) : null}

      {config.success ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Block className="min-w-0 space-y-3">
            <div>
              <SectionTitle icon="search">Auditoría en vivo</SectionTitle>
              <p className="text-sm text-muted">
                Rastrea{" "}
                <strong className="break-all text-foreground">
                  {config.data.siteUrl}
                </strong>{" "}
                (hasta {config.data.maxPages} páginas en total, incluyendo URLs
                adicionales y objetivos), revisa robots.txt, sitemaps y enlaces
                {config.data.checkPerformance
                  ? `, y mide Core Web Vitals (${config.data.strategy === "mobile" ? "móvil" : "escritorio"})`
                  : ""}
                .
              </p>
            </div>
            <LiveAuditForm studyId={study.id} />
          </Block>
          <Block className="min-w-0 space-y-3">
            <div>
              <SectionTitle icon="settings">Modo asistido</SectionTitle>
              <p className="text-sm text-muted">
                Para sitios que bloquean rastreadores de centros de datos
                (frecuente en retail): guarda el HTML desde tu navegador y
                súbelo.
              </p>
            </div>
            <UploadAuditForm studyId={study.id} />
          </Block>
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionTitle icon="layers">Auditorías</SectionTitle>
        <p className="text-xs text-muted">
          Se muestran las últimas 50 auditorías de este estudio.
        </p>
        {trend.length > 1 ? (
          <>
            <ScoreTrendChart rows={trend} />
            <p className="text-xs text-muted">
              Serie reciente con el mismo modo, motor, objetivos y
              comprobaciones. Los cambios de cobertura o versión inician una
              nueva serie.
            </p>
          </>
        ) : null}
        {audits.length === 0 ? (
          <EmptyState icon="search" title="Aún no hay auditorías">
            Lanza la primera auditoría con la URL del sitio para ver indexación,
            on-page y Core Web Vitals.
          </EmptyState>
        ) : (
          <RowList>
            {audits.map((a) => {
              const s = a.summary as AuditSummary;
              return (
                <RowLink
                  key={a.id}
                  href={`/studies/${study.id}/audits/${a.id}`}
                  icon="search"
                  title={
                    <span className="tabular-nums">
                      {s.score}/100 · <span className="break-all font-normal">{a.site_url}</span>
                    </span>
                  }
                  description={`${date(a.created_at)} · ${a.mode === "live" ? "En vivo" : "Asistido"} · ${s.pagesAudited} página(s) · ${s.scoreVersion}${a.ai_generated_at ? " · con plan de IA" : ""}`}
                  meta={
                    <>
                      {(["critical", "high", "medium"] as const).map((k) =>
                        s.counts[k] ? (
                          <span key={k} className="flex items-center gap-1">
                            <SeverityBadge severity={k} /> {s.counts[k]}
                          </span>
                        ) : null,
                      )}
                      {!s.counts.critical && !s.counts.high && !s.counts.medium ? <span>{SEVERITY_LABEL.ok}</span> : null}
                    </>
                  }
                />
              );
            })}
          </RowList>
        )}
      </section>
    </div>
  );
}
