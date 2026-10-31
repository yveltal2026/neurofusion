import { Alert } from "@/components/ui/alert";
import { Block } from "@/components/ui/card";
import type { SavedReport } from "../load";
import { reportEligibility, type ReportSnapshot } from "../model";
import { GenerateReportForm } from "./GenerateReportForm";

export function AiReportPanel({
  studyId,
  snapshot,
  sourceHash,
  saved,
  loadError,
}: {
  studyId: string;
  snapshot: ReportSnapshot;
  sourceHash: string;
  saved: SavedReport | null;
  loadError?: string;
}) {
  const eligibility = reportEligibility(snapshot);
  const stale = saved && saved.result.sourceHash !== sourceHash;
  const report = saved?.result.report;
  return (
    <section aria-label="Reporte breve con IA" className="space-y-4">
      <Block className="space-y-3">
        <h2 className="text-xl font-semibold">Reporte breve con IA</h2>
        {loadError ? <Alert tone="warning">{loadError}</Alert> : null}
        <p className="text-sm text-muted">
          Resumen, hallazgos y recomendaciones a partir de los resultados
          disponibles. Se guarda para consultarlo después.
        </p>
        {snapshot.kind === "survey" ? (
          <p className="text-xs text-muted">
            La IA recibe estadísticas agregadas, sin respuestas abiertas, datos
            personales ni imágenes adjuntas.
          </p>
        ) : snapshot.kind === "eye" ? (
          <p className="text-xs text-muted">
            La IA recibe métricas agregadas, sin grabaciones, lecturas
            individuales ni identificadores de participantes.
          </p>
        ) : (
          <p className="text-xs text-muted">
            La IA resume las evaluaciones visuales ya guardadas; no realiza una
            nueva lectura de las imágenes.
          </p>
        )}
        <GenerateReportForm
          studyId={studyId}
          {...eligibility}
          hasReport={Boolean(saved)}
        />
        {!report && !loadError ? (
          <p className="text-sm text-muted">
            Todavía no hay un reporte generado. Puedes consultar las
            visualizaciones sin usar IA.
          </p>
        ) : null}
      </Block>
      {stale ? (
        <Alert tone="warning">
          Los resultados cambiaron desde que se generó este reporte. Actualízalo
          para incluir los datos actuales.
        </Alert>
      ) : null}
      {saved && report ? (
        <Block className="space-y-5 break-inside-avoid">
          <p className="text-xs text-muted">
            Generado el{" "}
            {new Date(saved.createdAt).toLocaleString("es-MX", {
              timeZone: "America/Mexico_City",
            })}{" "}
            · {saved.provider} · {saved.model}. Interpretación asistida por IA;
            revisa sus conclusiones junto con las cifras del informe.
          </p>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Resumen ejecutivo</h3>
            <p className="text-sm leading-relaxed">{report.executiveSummary}</p>
          </div>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Hallazgos principales</h3>
            {report.findings.map((finding, i) => (
              <div key={i}>
                <h4 className="font-medium">{finding.headline}</h4>
                <p className="text-sm leading-relaxed">{finding.evidence}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-semibold">Recomendaciones</h3>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {report.recommendations.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Limitaciones</h3>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {report.limitations.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          </div>
        </Block>
      ) : null}
    </section>
  );
}
