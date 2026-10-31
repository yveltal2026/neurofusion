import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Block } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { EyeReportSnapshot } from "../model";
import { ReportBars } from "./ReportBars";

const fmt = (n: number | null, digits = 1) =>
  n === null
    ? "sin dato"
    : n.toLocaleString("es-MX", { maximumFractionDigits: digits });

export function EyeReportDashboard({
  studyId,
  snapshot,
  imageUrls = {},
}: {
  studyId: string;
  snapshot: EyeReportSnapshot;
  imageUrls?: Record<string, string>;
}) {
  const c = snapshot.counts;
  return (
    <div className="space-y-6">
      <Alert>
        Miradas medidas con webcam. Sólo se incluyen sesiones completadas con
        calibración aceptable y datos utilizables. Las fijaciones son
        aproximaciones; no demuestran comprensión, emoción ni intención de
        compra.
      </Alert>
      <Block className="space-y-3">
        <h2 className="text-xl font-semibold">Calidad de la muestra</h2>
        <ReportBars
          rows={[
            {
              label: "Incluidas en las métricas",
              value: c.completed ? (100 * c.included) / c.completed : null,
              detail: `${c.included} de ${c.completed}`,
            },
            {
              label: "Excluidas manualmente",
              value: c.completed ? (100 * c.excluded) / c.completed : null,
              detail: String(c.excluded),
            },
            {
              label: "Precisión limitada",
              value: c.completed ? (100 * c.limited) / c.completed : null,
              detail: String(c.limited),
            },
            {
              label: "Calibración insuficiente",
              value: c.completed ? (100 * c.lowQuality) / c.completed : null,
              detail: String(c.lowQuality),
            },
            {
              label: "Sin medición utilizable",
              value: c.completed ? (100 * c.invalid) / c.completed : null,
              detail: String(c.invalid),
            },
          ]}
        />
        <p className="text-xs text-muted">
          Se consultan todas las sesiones completadas del estudio. Las sesiones
          en curso no entran en estos conteos.
        </p>
      </Block>
      {!c.included ? (
        <EmptyState icon="eye" title="Aún no hay miradas utilizables">
          Cuando haya participaciones válidas aparecerán aquí el resumen por
          imagen y las zonas observadas.
        </EmptyState>
      ) : null}
      {snapshot.assets.map((asset) => (
        <Block key={asset.id} className="space-y-4 break-inside-avoid">
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* La imagen privada ya dispone de una URL firmada; se muestra completa. */}
            {imageUrls[asset.id] ? (
              <div className="w-full shrink-0 sm:w-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrls[asset.id]}
                  alt={asset.title}
                  className="max-h-44 w-full rounded-md object-contain"
                />
              </div>
            ) : null}
            <div className="min-w-0 space-y-2">
              <h2 className="break-words text-xl font-semibold">
                {asset.title}
              </h2>
              <p className="text-sm">
                {asset.participants} participantes con lecturas ·{" "}
                {fmt(asset.meanFixations)} fijaciones por participante ·{" "}
                {fmt(asset.validReadingsPct)} % de lecturas válidas.
              </p>
              <p className="text-xs text-muted">
                Exposición media:{" "}
                {asset.meanDurationMs === null
                  ? "sin dato"
                  : `${fmt(asset.meanDurationMs / 1000)} s`}
                . {asset.withoutFixations} participantes con lecturas pero sin
                fijaciones detectadas.
              </p>
            </div>
          </div>
          {asset.participants && asset.aois.length ? (
            <>
              <h3 className="font-semibold">Alcance de las zonas de interés</h3>
              <ReportBars
                rows={asset.aois.map((aoi) => ({
                  label: aoi.label,
                  value: aoi.hitRatePct,
                  detail: `${aoi.viewers}/${asset.participants} · ${fmt(aoi.hitRatePct)} %`,
                }))}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Métricas de zonas de interés de {asset.title}
                  </caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-4">Zona</th>
                      <th className="pr-4">Primera fijación (ms)</th>
                      <th className="pr-4">Fijaciones / participante</th>
                      <th className="pr-4">Permanencia media (ms)</th>
                      <th>Primera zona (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {asset.aois.map((aoi) => (
                      <tr key={aoi.id}>
                        <th scope="row" className="py-2 pr-4 font-medium">
                          {aoi.label}
                        </th>
                        <td className="pr-4 tabular-nums">{fmt(aoi.ttffMs)}</td>
                        <td className="pr-4 tabular-nums">
                          {fmt(aoi.fixationCount)}
                        </td>
                        <td className="pr-4 tabular-nums">
                          {fmt(aoi.dwellTimeMs)}
                        </td>
                        <td className="tabular-nums">
                          {fmt(aoi.firstFixationPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">
                El tiempo hasta la primera fijación se promedia sólo entre
                quienes fijaron la zona. Las zonas pueden solaparse y sus
                porcentajes no tienen que sumar 100 %.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              {asset.participants
                ? "Define zonas de interés para comparar qué elementos se observan."
                : "Esta imagen todavía no tiene lecturas utilizables."}
            </p>
          )}
          <Link
            href={`/studies/${studyId}/eye`}
            className="text-sm font-medium text-heading underline underline-offset-4 print:hidden"
          >
            Ver mapas de calor, recorridos y sesiones
          </Link>
        </Block>
      ))}
    </div>
  );
}
