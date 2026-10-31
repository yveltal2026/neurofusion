import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { StudyHeader } from "@/components/study-header";
import { buttonClass } from "@/components/ui/button";
import { Block } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import type { StudyRow } from "@/lib/db/types";
import { listItems } from "@/tools/survey/engine";
import { SurveyResultsView } from "@/tools/survey/ui/results-view";
import type { ReportSource, SavedReport } from "../load";
import { AiReportPanel } from "./AiReportPanel";
import { EyeReportDashboard } from "./EyeReportDashboard";
import { RefreshReportButton } from "./RefreshReportButton";

export function StudyReportView({
  study,
  projectName,
  source,
  sourceHash,
  saved,
  loadError,
  imageUrls,
}: {
  study: StudyRow;
  projectName: string | null;
  source: Exclude<ReportSource, { kind: "visual" }>;
  sourceHash: string;
  saved: SavedReport | null;
  loadError?: string;
  imageUrls?: Record<string, string>;
}) {
  const survey = source.kind === "survey";
  const units = survey
    ? source.snapshot.aggregates.nIncluded
    : source.snapshot.counts.included;
  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="report"
        variant={survey ? "survey" : "eye"}
        subtitle={
          survey
            ? "Informe y resultados de la encuesta"
            : "Informe de miradas medidas"
        }
        actions={
          <>
            <RefreshReportButton />
            <PrintButton />
            <Link
              href={`/api/studies/${study.id}/${survey ? "export/survey_responses" : "eye/export"}`}
              className={buttonClass("secondary")}
              prefetch={false}
            >
              Descargar CSV
            </Link>
          </>
        }
      />
      <StatStrip
        items={[
          {
            icon: "survey",
            label: survey ? "Respuestas completadas" : "Sesiones completadas",
            value: survey
              ? source.snapshot.aggregates.nTotal
              : source.snapshot.counts.completed,
          },
          { icon: "check", label: "Incluidas en resultados", value: units },
          {
            icon: "layers",
            label: survey ? "Preguntas e ítems" : "Imágenes del estudio",
            value: survey
              ? listItems(source.config).length
              : source.snapshot.assets.length,
          },
          {
            icon: "results",
            label: "Reporte con IA",
            value: saved
              ? "Guardado"
              : loadError
                ? "No disponible"
                : "Sin generar",
          },
        ]}
      />
      <AiReportPanel
        studyId={study.id}
        snapshot={source.snapshot}
        sourceHash={sourceHash}
        saved={saved}
        loadError={loadError}
      />
      {source.kind === "survey" ? (
        <>
          <SurveyResultsView
            config={source.config}
            aggregates={source.snapshot.aggregates}
            token={study.access_token}
          />
          {listItems(source.config)
            .filter((item) => item.type === "text")
            .map((item) => {
              const answers = source.records
                .filter((record) => !record.excluded)
                .flatMap((record) => {
                  const value = record.answers[item.id];
                  return typeof value === "string" && value.trim()
                    ? [value]
                    : [];
                });
              return (
                <Block key={item.id} className="space-y-3">
                  <h2 className="text-xl font-semibold">
                    Respuestas abiertas · {item.label}
                  </h2>
                  <p className="text-xs text-muted">
                    {answers.length} respuestas. Sólo se muestran al
                    investigador; no se envían al reporte con IA.
                  </p>
                  <details>
                    <summary className="cursor-pointer font-medium text-heading">
                      Leer respuestas
                    </summary>
                    <ul className="mt-3 space-y-3">
                      {answers.slice(0, 100).map((answer, i) => (
                        <li
                          key={i}
                          className="break-words whitespace-pre-wrap rounded-md bg-background p-3 text-sm"
                        >
                          {answer}
                        </li>
                      ))}
                    </ul>
                    {answers.length > 100 ? (
                      <p className="mt-3 text-sm text-muted">
                        Se muestran las 100 más recientes. El CSV contiene todas
                        las respuestas.
                      </p>
                    ) : null}
                    {!answers.length ? (
                      <p className="mt-3 text-sm text-muted">
                        Todavía no hay respuestas escritas para esta pregunta.
                      </p>
                    ) : null}
                  </details>
                </Block>
              );
            })}
        </>
      ) : (
        <EyeReportDashboard
          studyId={study.id}
          snapshot={source.snapshot}
          imageUrls={imageUrls}
        />
      )}
    </div>
  );
}
