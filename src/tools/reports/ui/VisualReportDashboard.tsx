import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Block } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatStrip } from "@/components/ui/stat-strip";
import type { VisualReportSnapshot } from "../model";
import { ReportBars } from "./ReportBars";

export function VisualReportDashboard({
  studyId,
  snapshot,
  children,
}: {
  studyId: string;
  snapshot: VisualReportSnapshot;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Resumen de resultados visuales" className="space-y-6">
      <Alert>
        Estimaciones de IA sobre las imágenes, sin participantes. Las
        puntuaciones y mapas no son mediciones de eye tracking ni pronósticos de
        comportamiento.
      </Alert>
      <StatStrip
        items={[
          { icon: "image", label: "Piezas", value: snapshot.total },
          { icon: "check", label: "Analizadas", value: snapshot.analyzed },
          { icon: "clock", label: "Pendientes", value: snapshot.pending },
          {
            icon: "alert",
            label: "Mejoras de prioridad alta",
            value: snapshot.highPriorityIssues,
          },
        ]}
      />
      {children}
      {snapshot.analyzed ? (
        <Block className="space-y-4">
          <h2 className="text-xl font-semibold">
            Evaluación general de las piezas
          </h2>
          <ReportBars
            max={5}
            rows={snapshot.criteria.map((criterion) => ({
              label: criterion.label,
              value: criterion.mean,
              detail:
                criterion.mean === null
                  ? "sin dato"
                  : `${criterion.mean.toLocaleString("es-MX", { maximumFractionDigits: 1 })} / 5`,
            }))}
          />
          <p className="text-xs text-muted">
            Promedios de las {snapshot.analyzed} piezas analizadas. Escala de 1
            a 5: 5 es mejor; en carga visual, 5 significa ligera.
          </p>
        </Block>
      ) : (
        <EmptyState icon="results" title="Aún no hay imágenes analizadas">
          Analiza una pieza desde la pestaña Piezas para ver sus resultados y
          generar el reporte general.
        </EmptyState>
      )}
      {snapshot.assets.length ? (
        <Block className="space-y-4">
          <h2 className="text-xl font-semibold">Resultados por pieza</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-4">Pieza</th>
                  <th className="pr-4">Estado</th>
                  <th>Lectura principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.assets.map((asset) => (
                  <tr key={asset.id}>
                    <th scope="row" className="py-3 pr-4 font-medium">
                      <Link
                        href={`/studies/${studyId}/assets/${asset.id}`}
                        className="text-heading underline underline-offset-4"
                      >
                        {asset.title}
                      </Link>
                    </th>
                    <td className="pr-4">
                      {asset.analysis ? "Analizada" : "Pendiente"}
                    </td>
                    <td>
                      {asset.analysis?.message ?? "Sin evaluación guardada"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ) : null}
      {snapshot.assets.some((asset) => asset.analysis?.weaknesses.length) ? (
        <Block className="space-y-4">
          <h2 className="text-xl font-semibold">Mejoras sugeridas por pieza</h2>
          <ul className="space-y-4">
            {snapshot.assets.flatMap((asset) =>
              (asset.analysis?.weaknesses ?? []).map((weakness, i) => (
                <li key={`${asset.id}-${i}`} className="space-y-1 text-sm">
                  <p className="font-medium">
                    {asset.title} ·{" "}
                    {weakness.severity === "high"
                      ? "Prioridad alta"
                      : weakness.severity === "medium"
                        ? "Prioridad media"
                        : "Prioridad baja"}
                  </p>
                  <p>{weakness.problem}</p>
                  <p className="text-muted">{weakness.recommendation}</p>
                </li>
              )),
            )}
          </ul>
        </Block>
      ) : null}
    </section>
  );
}
