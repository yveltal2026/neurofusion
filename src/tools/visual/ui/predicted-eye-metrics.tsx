"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { toCsv } from "@/lib/csv";
import {
  aoiPredictions,
  PREDICTION_EXPOSURE_MS,
  PREDICTION_NOTICE,
  PREDICTION_VERSION,
} from "../analysis/prediction";
import type { PieceAiResult } from "../analysis/piece";
import { AOI_KIND_LABEL, type Aoi } from "../engine/aoi";

const columns = [
  "AOI",
  "TTFF (ms)",
  "FC",
  "FD media (ms)",
  "TFD (ms)",
  "Dwell (ms)",
  "Hit rate (%)",
  "Primera fijación (%)",
  "Visitas",
  "Regresos",
];
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-MX", { maximumFractionDigits: 1 });

export function PredictedEyeMetrics({
  result,
  aois,
  analyzedAois,
  asset,
}: {
  result: PieceAiResult;
  aois: Aoi[];
  analyzedAois: Aoi[];
  asset?: { id: string; title: string };
}) {
  const rows = aoiPredictions(result, aois, analyzedAois);
  function exportCsv() {
    const csv = toCsv(
      [
        "image_id",
        "image_title",
        "source",
        "prediction_version",
        "exposure_ms",
        "status",
        "aoi_id",
        "aoi_kind",
        ...columns,
        "rationale",
      ],
      rows.map((r) => {
        const p = r.prediction;
        return [
          asset?.id,
          asset?.title,
          "ai_prediction_unvalidated",
          PREDICTION_VERSION,
          PREDICTION_EXPOSURE_MS,
          r.status,
          r.aoi.id,
          r.aoi.kind,
          r.aoi.label,
          p?.ttffMs,
          p?.fixationCount,
          p?.meanFixationDurationMs,
          r.totalFixationDurationMs,
          p?.dwellTimeMs,
          p?.hitRatePct,
          p?.firstFixationPct,
          p?.visitCount,
          r.revisitCount,
          p?.rationale,
        ];
      }),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `predicciones-ia-${asset?.id ?? "imagen"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">KPIs estimados por área de interés</h3>
        <StatusBadge tone="warning">IA · no medido · no validado</StatusBadge>
      </div>
      <p className="text-sm text-muted">{PREDICTION_NOTICE}</p>
      <p className="text-xs text-muted">
        Los tiempos y conteos representan un recorrido hipotético típico por
        área; las tasas son hipótesis poblacionales independientes, sin
        participantes ni tamaño de muestra. No son promedios observados ni
        probabilidades calibradas.
      </p>
      {rows.length ? (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-sm print:text-[8px]">
            <caption className="sr-only">
              Predicciones de eye tracking por AOI, no medidas ni validadas,
              para cinco segundos de exposición
            </caption>
            <thead className="bg-neuro-wash font-display text-xs font-semibold text-muted">
              <tr>
                {columns.map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 print:whitespace-normal print:px-1"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const p = r.prediction;
                const values = [
                  p?.ttffMs,
                  p?.fixationCount,
                  p?.meanFixationDurationMs,
                  r.totalFixationDurationMs,
                  p?.dwellTimeMs,
                  p?.hitRatePct,
                  p?.firstFixationPct,
                  p?.visitCount,
                  r.revisitCount,
                ];
                return (
                  <tr key={r.aoi.id}>
                    <th
                      scope="row"
                      className="min-w-44 px-3 py-2 font-medium print:min-w-0 print:px-1"
                    >
                      {r.aoi.label}
                      <span className="block text-xs font-normal text-muted">
                        {r.aoi.id} · {AOI_KIND_LABEL[r.aoi.kind]}
                        {r.status === "edited"
                          ? " · área modificada, sin predicción vigente"
                          : r.status === "legacy"
                            ? " · requiere nuevo análisis"
                            : ""}
                      </span>
                    </th>
                    {values.map((v, i) => (
                      <td key={i} className="px-3 py-2 tabular-nums">
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          No hay áreas de interés disponibles para este desglose.
        </p>
      )}
      {!rows.some((r) => r.prediction) ? (
        <p className="text-sm text-muted">
          Los análisis anteriores conservan sus resultados. Para obtener estas
          estimaciones, vuelve a analizar la imagen; las áreas editadas
          manualmente se conservan y se dejan sin valores temporales si difieren
          de las propuestas por IA.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="print:hidden"
        onClick={exportCsv}
        disabled={!rows.length}
      >
        Descargar predicciones por AOI CSV
      </Button>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">
          Definiciones y fundamento de las estimaciones
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            TTFF: tiempo previsto hasta la primera fijación. FC: número de
            fijaciones previsto. FD: duración media prevista. TFD = FC × FD.
            Dwell incluye fijaciones y transiciones internas de las visitas
            previstas. Regresos = máximo entre visitas − 1 y cero. «—» significa
            ausencia de estimación o fijación; no equivale a cero.
          </p>
          <p>
            Las estimaciones corresponden a las cajas de la lectura de IA. Si se
            modifica una caja o su tipo, sus valores no se trasladan a la nueva
            área. Las áreas superpuestas se estiman de manera independiente; no
            sumes sus tiempos ni tasas. Método {PREDICTION_VERSION}.
          </p>
          {rows
            .filter((r) => r.prediction)
            .map((r) => (
              <p key={r.aoi.id}>
                <strong>{r.aoi.label}:</strong> {r.prediction!.rationale}
              </p>
            ))}
        </div>
      </details>
    </Card>
  );
}
