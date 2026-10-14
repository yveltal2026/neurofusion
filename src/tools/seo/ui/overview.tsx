import Link from "next/link";
import { ScoreTrendChart } from "@/components/charts/seo-charts";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { SeoAuditRow, StudyRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { seoConfigSchema } from "../config";
import { SEVERITY_LABEL, type AuditSummary } from "../engine";
import { LiveAuditForm, UploadAuditForm } from "./forms";
import { SeverityBadge } from "./findings-table";

const date = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

export async function SeoOverview({ study, projectName, created }: { study: StudyRow; projectName: string | null; created: boolean }) {
  const supabase = await createClient();
  const config = seoConfigSchema.safeParse(study.config);
  const { data } = await supabase
    .from("seo_audits")
    .select("id, mode, site_url, summary, created_at, ai_generated_at")
    .eq("study_id", study.id)
    .order("created_at", { ascending: false })
    .returns<Pick<SeoAuditRow, "id" | "mode" | "site_url" | "summary" | "created_at" | "ai_generated_at">[]>();
  const audits = data ?? [];
  const trend = [...audits]
    .reverse()
    .map((a) => ({ label: new Date(a.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }), score: (a.summary as AuditSummary).score }));

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} active="overview" variant="seo" />
      {created ? <Alert>Estudio creado. Lanza la primera auditoría.</Alert> : null}
      {!config.success ? <Alert tone="warning">La configuración guardada no es válida. Revísala en Ajustes.</Alert> : null}

      {config.success ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="min-w-0 space-y-3">
            <div>
              <h2 className="font-medium">Auditoría en vivo</h2>
              <p className="text-sm text-muted">
                Rastrea <strong className="break-all text-foreground">{config.data.siteUrl}</strong> (hasta {config.data.maxPages} páginas
                {config.data.extraUrls.length ? ` + ${config.data.extraUrls.length} URLs adicionales` : ""}), revisa robots.txt, sitemaps y
                enlaces{config.data.checkPerformance ? `, y mide Core Web Vitals (${config.data.strategy === "mobile" ? "móvil" : "escritorio"})` : ""}.
              </p>
            </div>
            <LiveAuditForm studyId={study.id} />
          </Card>
          <Card className="min-w-0 space-y-3">
            <div>
              <h2 className="font-medium">Modo asistido</h2>
              <p className="text-sm text-muted">
                Para sitios que bloquean rastreadores de centros de datos (frecuente en retail): guarda el HTML desde tu navegador y súbelo.
              </p>
            </div>
            <UploadAuditForm studyId={study.id} />
          </Card>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-medium">Auditorías</h2>
        {trend.length > 1 ? <ScoreTrendChart rows={trend} /> : null}
        {audits.length === 0 ? (
          <Card className="text-sm text-muted">Aún no hay auditorías.</Card>
        ) : (
          <ul className="space-y-2">
            {audits.map((a) => {
              const s = a.summary as AuditSummary;
              return (
                <li key={a.id}>
                  <Link href={`/studies/${study.id}/audits/${a.id}`} className="block">
                    <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-primary">
                      <div>
                        <p className="break-all font-medium">
                          {s.score}/100 · {a.site_url}
                        </p>
                        <p className="text-xs text-muted">
                          {date(a.created_at)} · {a.mode === "live" ? "En vivo" : "Asistido"} · {s.pagesAudited} página(s)
                          {a.ai_generated_at ? " · con plan de IA" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {(["critical", "high", "medium"] as const).map((k) =>
                          s.counts[k] ? (
                            <span key={k} className="flex items-center gap-1">
                              <SeverityBadge severity={k} /> {s.counts[k]}
                            </span>
                          ) : null,
                        )}
                        {!s.counts.critical && !s.counts.high && !s.counts.medium ? <span>{SEVERITY_LABEL.ok}</span> : null}
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
