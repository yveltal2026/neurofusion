import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  diagnosticFindings,
  pageDiagnostic,
  recommendation,
} from "../diagnostics";
import { compareAudits } from "../comparison";
import type { SeoAudit } from "../results";
import type { Finding } from "../engine";
import { SeverityBadge } from "./findings-table";

function EvidenceList({
  findings,
  empty,
  advice = false,
}: {
  findings: Finding[];
  empty: string;
  advice?: boolean;
}) {
  if (!findings.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3 text-sm">
      {findings.map((f, i) => (
        <li key={`${f.rule}-${f.url}-${i}`} className="space-y-1">
          <p className="font-medium">{f.element}</p>
          <p className="break-words">{f.detail}</p>
          {f.url && <p className="break-all text-xs text-muted">{f.url}</p>}
          {advice && <p className="text-muted">Acción: {recommendation(f)}</p>}
        </li>
      ))}
    </ul>
  );
}

export function SeoExecutiveSummary({ audit }: { audit: SeoAudit }) {
  const diagnostics = diagnosticFindings(audit.findings);
  const coverage = audit.summary.coverage;
  return (
    <section aria-labelledby="seo-executive" className="space-y-4">
      <div>
        <h2 id="seo-executive" className="text-lg font-semibold">
          Resumen del diagnóstico
        </h2>
        <p className="mt-1 text-sm text-muted">
          Basado en las comprobaciones automáticas de esta auditoría. La
          puntuación es una heurística de NeuroFusion; no mide posiciones ni
          tráfico en Google.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="font-medium">Aciertos comprobados</h3>
          <EvidenceList
            findings={diagnostics.strengths}
            empty="No hay comprobaciones correctas suficientes para destacar aciertos."
          />
        </Card>
        <Card className="space-y-3">
          <h3 className="font-medium">Debilidades principales</h3>
          <EvidenceList
            findings={diagnostics.weaknesses}
            empty="No se detectaron problemas confirmados en las comprobaciones realizadas. Esto no garantiza que no existan otros."
          />
        </Card>
      </div>
      <Card className="space-y-3">
        <h3 className="font-medium">Qué corregir primero</h3>
        <EvidenceList
          findings={diagnostics.weaknesses}
          advice
          empty="Revisa las observaciones contextuales y amplía la cobertura antes de concluir que el sitio no necesita cambios."
        />
      </Card>
      <Card className="space-y-3">
        <h3 className="font-medium">Cobertura y límites</h3>
        {coverage ? (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted">Páginas con HTML revisado</dt>
                <dd>
                  {coverage.htmlPages} · límite {coverage.requestedPages}
                </dd>
              </div>
              <div>
                <dt className="text-muted">
                  URLs con respuesta HTTP comprobada
                </dt>
                <dd>{coverage.httpChecks}</dd>
              </div>
              <div>
                <dt className="text-muted">URLs del sitemap contrastadas</dt>
                <dd>
                  {coverage.sitemapChecked} de {coverage.sitemapUrls}{" "}
                  descubiertas
                </dd>
              </div>
              <div>
                <dt className="text-muted">URLs omitidas por robots.txt</dt>
                <dd>{coverage.blockedUrls}</dd>
              </div>
              <div>
                <dt className="text-muted">Rendimiento</dt>
                <dd>
                  {coverage.performanceMeasured
                    ? "Página principal medida con PageSpeed"
                    : coverage.performanceRequested
                      ? "Solicitado, sin resultado disponible"
                      : "No solicitado"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Finalización</dt>
                <dd>
                  {
                    {
                      complete: "Cola de esta muestra agotada",
                      page_limit: "Límite de páginas alcanzado",
                      time_limit: "Límite de tiempo alcanzado",
                      fetch_limit: "Límite de descargas alcanzado",
                      upload: "HTML subido por el analista",
                    }[coverage.stopReason]
                  }
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-muted">
            Esta auditoría anterior no guardó el desglose de cobertura. Ejecuta
            una nueva para disponer de él.
          </p>
        )}
        <p className="text-xs text-muted">
          Se analiza HTML sin ejecutar JavaScript. La comprobación de canónicas,
          sitemap y reciprocidad hreflang se limita a las URLs descargadas o
          bloqueos observados. El marcado JSON-LD tiene validaciones básicas, no
          una certificación de resultados enriquecidos. No se consulta el índice
          ni Search Console.
        </p>
        <p className="text-xs text-muted">
          {audit.summary.advisoryCount ?? diagnostics.contextual.length}{" "}
          observaciones contextuales: no restan puntos. Entre ellas pueden estar
          longitudes de texto, coincidencias de palabras clave y varios H1.
        </p>
      </Card>
    </section>
  );
}

export function SeoPageDiagnostics({ audit }: { audit: SeoAudit }) {
  return (
    <section aria-labelledby="seo-pages" className="space-y-3">
      <h2 id="seo-pages" className="text-lg font-semibold">
        Diagnóstico por página
      </h2>
      <p className="text-sm text-muted">
        Abre una URL para consultar su contexto guardado, evidencia y acciones.
        La puntuación local incluye sólo sus comprobaciones, sin los hallazgos
        generales del sitio.
      </p>
      {audit.pages.map((page, i) => {
        const diagnosis = pageDiagnostic(page, audit.findings);
        return (
          <details
            key={`${page.url}-${i}`}
            className="rounded-lg border border-border bg-surface p-4 open:space-y-4 print:break-inside-avoid print:[&::details-content]:block print:[&::details-content]:[content-visibility:visible]"
          >
            <summary className="cursor-pointer break-all text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">
              {page.title ?? page.url} ·{" "}
              {page.wordCount === null
                ? "Sin HTML revisado"
                : `${diagnosis.summary.score}/100 local`}
              <span className="mt-1 block text-xs font-normal text-muted">
                {page.url}
              </span>
            </summary>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="inline text-muted">Objetivo: </dt>
                <dd className="inline">
                  {page.target?.goal || "Sin objetivo específico guardado"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">Palabra clave: </dt>
                <dd className="inline">
                  {page.target?.keyword ?? "Sin palabra clave guardada"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">Visibilidad deseada: </dt>
                <dd className="inline">
                  {page.target
                    ? page.target.indexable
                      ? "Puede aparecer en buscadores"
                      : "Excluir con noindex"
                    : "No guardada en esta versión"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">Título: </dt>
                <dd className="inline">{page.title ?? "No detectado"}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Descripción: </dt>
                <dd className="inline">
                  {page.metaDescription ?? "No detectada"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">H1: </dt>
                <dd className="inline">{page.h1 ?? "No detectado"}</dd>
              </div>
            </dl>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-medium">Aciertos</h3>
                <EvidenceList
                  findings={diagnosis.strengths}
                  empty="Sin aciertos comprobados para destacar."
                />
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">Debilidades y acciones</h3>
                <EvidenceList
                  findings={diagnosis.weaknesses}
                  advice
                  empty="Sin problemas confirmados en las comprobaciones disponibles."
                />
              </div>
            </div>
            {diagnosis.contextual.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="font-medium">
                  Revisiones contextuales · sin penalización
                </h3>
                <EvidenceList findings={diagnosis.contextual} empty="" advice />
              </div>
            )}
          </details>
        );
      })}
      {!audit.pages.length && (
        <p className="text-sm text-muted">
          No hay páginas descargadas para diagnosticar.
        </p>
      )}
    </section>
  );
}

export function SeoAuditComparison({
  audit,
  previous,
  studyId,
}: {
  audit: SeoAudit;
  previous: SeoAudit | null;
  studyId: string;
}) {
  if (!previous)
    return (
      <Card className="space-y-2">
        <h2 className="font-medium">Comparación entre auditorías</h2>
        <p className="text-sm text-muted">
          Esta es la primera auditoría del estudio. Las siguientes podrán
          contrastar problemas nuevos, resueltos y persistentes.
        </p>
      </Card>
    );
  const comparison = compareAudits(audit, previous);
  const groups = [
    ["Nuevos problemas", comparison.newIssues],
    ["Resueltos comprobados", comparison.resolved],
    ["Persistentes", comparison.persistent],
    ["Detectados por primera vez", comparison.firstObserved],
    ["Sin verificar de nuevo", comparison.unverified],
  ] as const;
  return (
    <Card className="space-y-4">
      <h2 className="font-medium">Comparación con la auditoría anterior</h2>
      <Link
        className="break-all text-sm text-primary underline"
        href={`/studies/${studyId}/audits/${previous.id}`}
      >
        Ver auditoría del {new Date(previous.createdAt).toLocaleString("es-MX")}
      </Link>
      {comparison.reason && (
        <p className="text-sm text-muted">{comparison.reason}</p>
      )}
      {comparison.compatible && (
        <>
          <p className="text-sm">
            {comparison.scoreDelta === null
              ? "Sin diferencia global comparable."
              : `Cambio de puntuación: ${comparison.scoreDelta > 0 ? "+" : ""}${comparison.scoreDelta} puntos.`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([label, rows]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {rows.length}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            “Nuevo” exige una comprobación anterior correcta; “resuelto” exige
            una comprobación actual correcta. Una URL no revisada de nuevo queda
            sin verificar. Las observaciones contextuales no se cuentan como
            problemas.
          </p>
          {groups.some(([, rows]) => rows.length > 0) && (
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm font-medium">
                Ver cambios y evidencia
              </summary>
              {groups.map(
                ([label, rows]) =>
                  rows.length > 0 && (
                    <div key={label} className="space-y-2 pt-3">
                      <h3 className="font-medium">{label}</h3>
                      <ul className="space-y-2 text-sm">
                        {rows.map((f, i) => (
                          <li
                            key={`${f.rule}-${f.url}-${i}`}
                            className="space-y-1"
                          >
                            <p>
                              <StatusBadge tone="neutral">
                                {f.element}
                              </StatusBadge>{" "}
                              <SeverityBadge severity={f.severity} />
                            </p>
                            <p className="break-words">{f.detail}</p>
                            <p className="break-all text-xs text-muted">
                              {f.url ?? "Todo el sitio"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )}
            </details>
          )}
        </>
      )}
    </Card>
  );
}
