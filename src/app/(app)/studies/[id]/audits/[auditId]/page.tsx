import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import type { SeoAuditRow, StudyRow } from "@/lib/db/types";
import { deleteSeoAudit } from "@/tools/seo/actions";
import { toSeoAudit } from "@/tools/seo/results";
import {
  CategoryChart,
  PagesTable,
  PerformanceCard,
  SeoPlanView,
  SummaryCards,
} from "@/tools/seo/ui/audit-view";
import { FindingsTable } from "@/tools/seo/ui/findings-table";
import { SeoPlanForm } from "@/tools/seo/ui/forms";
import {
  SeoExecutiveSummary,
  SeoPageDiagnostics,
  SeoAuditComparison,
} from "@/tools/seo/ui/diagnostic-view";

export const metadata = { title: "Auditoría SEO · NeuroFusion" };
// La redacción del plan con IA puede tardar.
export const maxDuration = 120;

export default async function AuditPage({
  params,
}: PageProps<"/studies/[id]/audits/[auditId]">) {
  const { id, auditId } = await params;
  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .eq("tool_type", "seo")
    .maybeSingle<StudyRow>();
  if (!study) notFound();
  const { data: row } = await supabase
    .from("seo_audits")
    .select("*")
    .eq("id", auditId)
    .eq("study_id", id)
    .maybeSingle<SeoAuditRow>();
  if (!row) notFound();
  const [{ data: previousRow, error: previousError }, { data: project }] =
    await Promise.all([
      supabase
        .from("seo_audits")
        .select("*")
        .eq("study_id", id)
        .lt("created_at", row.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SeoAuditRow>(),
      supabase
        .from("projects")
        .select("name")
        .eq("id", study.project_id)
        .maybeSingle(),
    ]);
  const audit = toSeoAudit(row);
  const when = new Date(audit.createdAt).toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={project?.name}
        active="overview"
        variant="seo"
        subtitle={`${audit.siteUrl} · ${when}`}
        actions={
          <>
            <a
              href={`/api/studies/${id}/audits/${auditId}/csv`}
              className={buttonClass("secondary")}
            >
              Descargar CSV
            </a>
            <PrintButton />
          </>
        }
      />

      <SummaryCards
        summary={audit.summary}
        lighthouseSeo={audit.performance?.lighthouseSeoScore}
      />
      <SeoExecutiveSummary audit={audit} />
      {previousError ? (
        <Alert tone="warning">
          No se pudo cargar la auditoría anterior. Recarga la página para
          consultar la comparación.
        </Alert>
      ) : (
        <SeoAuditComparison
          audit={audit}
          previous={previousRow ? toSeoAudit(previousRow) : null}
          studyId={id}
        />
      )}
      <p className="text-xs text-muted">
        {audit.mode === "live"
          ? "Rastreo en vivo"
          : "Modo asistido (HTML subido)"}{" "}
        · {audit.summary.pagesAudited} página(s) · motor {audit.engineVersion}
        {audit.durationMs !== null
          ? ` · ${(audit.durationMs / 1000).toFixed(0)} s`
          : ""}
      </p>
      {audit.notes.length ? (
        <div className="space-y-2">
          {audit.notes.map((n) => (
            <Alert key={n}>{n}</Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryChart summary={audit.summary} />
        {audit.performance ? (
          <PerformanceCard perf={audit.performance} />
        ) : null}
      </div>

      <section className="space-y-3 break-before-page">
        <div>
          <h2 className="font-medium">Plan de acción con IA</h2>
          <p className="text-sm text-muted">
            La IA prioriza y redacta a partir de los hallazgos de abajo; no ve
            el HTML ni inventa cifras. Revisa sus propuestas antes de
            aplicarlas.
          </p>
        </div>
        <SeoPlanForm
          studyId={id}
          auditId={auditId}
          hasPlan={Boolean(audit.ai)}
        />
        {audit.ai ? (
          <>
            <p className="text-xs text-muted">
              Generado el{" "}
              {audit.ai.generatedAt
                ? new Date(audit.ai.generatedAt).toLocaleString("es-MX")
                : "—"}{" "}
              · {audit.ai.provider} · {audit.ai.model}
            </p>
            <SeoPlanView plan={audit.ai.result} />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Hallazgos</h2>
        <FindingsTable findings={audit.findings} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Páginas revisadas</h2>
        <PagesTable pages={audit.pages} />
      </section>
      <SeoPageDiagnostics audit={audit} />

      <form action={deleteSeoAudit} className="print:hidden">
        <input type="hidden" name="studyId" value={id} />
        <input type="hidden" name="auditId" value={auditId} />
        <Button type="submit" variant="ghost" className="text-danger">
          Eliminar esta auditoría
        </Button>
      </form>
    </div>
  );
}
