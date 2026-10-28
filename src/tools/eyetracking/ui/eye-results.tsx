"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { EyeKpiGuide } from "./kpi-guide";
import { toCsv, type CsvCell } from "@/lib/csv";
import type { Aoi } from "@/tools/visual/engine/aoi";
import { buildFixationHeatmap } from "@/tools/visual/eye/heatmap";
import {
  aggregateEyeMetrics,
  EYE_METRICS_VERSION,
  mean,
  type EyeParticipant,
  type AoiMetrics,
  type AggregateAoi,
} from "@/tools/visual/eye/metrics";

const fmt = (n: number | null, digits = 1) =>
  n === null
    ? "sin dato"
    : n.toLocaleString("es-MX", { maximumFractionDigits: digits });
const headers = [
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
function cells(row: AoiMetrics | AggregateAoi, count: number): CsvCell[] {
  return [
    row.label,
    count ? row.ttffMs : null,
    count ? row.fixationCount : null,
    count ? row.meanFixationDurationMs : null,
    count ? row.totalFixationDurationMs : null,
    count ? row.dwellTimeMs : null,
    "hitRatePct" in row ? row.hitRatePct : row.fixationCount ? 100 : 0,
    "firstFixationPct" in row
      ? row.firstFixationPct
      : row.firstFixation
        ? 100
        : 0,
    count ? row.visitCount : null,
    count ? row.revisitCount : null,
  ];
}
function download(name: string, columns: string[], rows: CsvCell[][]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EyeResults({
  studyId,
  assetId,
  title,
  imageUrl,
  width,
  height,
  aois,
  participants,
}: {
  studyId: string;
  assetId: string;
  title: string;
  imageUrl?: string;
  width: number;
  height: number;
  aois: Aoi[];
  participants: EyeParticipant[];
}) {
  const [view, setView] = useState<"heatmap" | "gaze" | "aois">("heatmap");
  const [heatMetric, setHeatMetric] = useState<"count" | "duration">(
    "duration",
  );
  const [session, setSession] = useState("all");
  const gradientId = useId().replace(/:/g, "");
  const aggregate = useMemo(
    () => aggregateEyeMetrics(participants, aois, { width, height }),
    [participants, aois, width, height],
  );
  const selected = aggregate.participants.find((p) => p.sessionId === session);
  const visible = useMemo(
    () => (selected ? [selected] : aggregate.participants),
    [selected, aggregate.participants],
  );
  const heat = useMemo(
    () => buildFixationHeatmap(visible, heatMetric),
    [visible, heatMetric],
  );
  const rows = selected ? selected.metrics.aois : aggregate.aois;
  const transitions = visible.flatMap((p) => p.metrics.transitions);
  const fixationCount = visible.reduce(
    (n, p) => n + p.metrics.fixations.length,
    0,
  );
  const totalDuration = visible.reduce(
    (n, p) => n + p.metrics.fixations.reduce((n, f) => n + f.durationMs, 0),
    0,
  );
  return (
    <section className="space-y-4" aria-label={`Resultados de ${title}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-xs text-muted">
            {aggregate.count} sesiones con lecturas ·{" "}
            {aggregate.withoutFixations} sin fijaciones detectadas ·{" "}
            {participants.length - aggregate.count} registros sin lecturas o
            repetidos fuera del agregado
          </p>
        </div>
        <Link
          href={`/studies/${studyId}/assets/${assetId}`}
          className="text-sm underline"
        >
          Definir áreas de interés ({aois.length})
        </Link>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          Participante
          <select
            aria-label="Participante"
            className="ml-2 rounded border border-border bg-background p-2"
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            <option value="all">Todos (agregado)</option>
            {aggregate.participants.map((p) => (
              <option key={p.sessionId} value={p.sessionId}>
                {p.participant}
              </option>
            ))}
          </select>
        </label>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Visualización"
        >
          {(
            [
              ["heatmap", "Heatmap"],
              ["gaze", "Gaze plot"],
              ["aois", "Áreas de interés"],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`rounded border px-3 py-1 text-sm ${view === id ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "heatmap" ? (
          <label className="text-sm">
            Métrica del mapa
            <select
              aria-label="Métrica del mapa"
              value={heatMetric}
              onChange={(e) =>
                setHeatMetric(e.target.value as "count" | "duration")
              }
              className="ml-2 rounded border border-border bg-background p-2"
            >
              <option value="duration">Duración de fijaciones</option>
              <option value="count">Número de fijaciones</option>
            </select>
          </label>
        ) : null}
      </div>
      {imageUrl ? (
        <div
          className="relative mx-auto w-full max-w-4xl overflow-hidden rounded border border-border"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed private storage URL */}
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 size-full"
          />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              view === "heatmap"
                ? `Mapa de calor por ${heatMetric === "duration" ? "duración" : "número"} de fijaciones`
                : view === "gaze"
                  ? "Secuencia de fijaciones por participante"
                  : "Áreas de interés delimitadas"
            }
            className="pointer-events-none absolute inset-0 size-full"
          >
            <defs>
              <radialGradient id={gradientId}>
                <stop offset="0" stopColor="#ff1600" stopOpacity="0.9" />
                <stop offset="0.4" stopColor="#ff9d00" stopOpacity="0.65" />
                <stop offset="0.7" stopColor="#ffef00" stopOpacity="0.3" />
                <stop offset="1" stopColor="#ffef00" stopOpacity="0" />
              </radialGradient>
            </defs>
            {view === "heatmap"
              ? heat.map((cell, i) => (
                  <circle
                    key={i}
                    cx={cell.x * width}
                    cy={cell.y * height}
                    r={Math.hypot(width, height) * 0.045}
                    fill={`url(#${gradientId})`}
                    opacity={Math.sqrt(cell.strength)}
                  />
                ))
              : null}
            {view === "gaze"
              ? visible.map((p, i) => {
                  const color = `hsl(${(i * 137.5) % 360} 85% 50%)`;
                  return (
                    <g key={p.sessionId}>
                      {p.metrics.transitions.map((t) => {
                        const from = p.metrics.fixations[t.from],
                          to = p.metrics.fixations[t.to];
                        return (
                          <line
                            key={t.to}
                            x1={from.x * width}
                            y1={from.y * height}
                            x2={to.x * width}
                            y2={to.y * height}
                            stroke={color}
                            strokeWidth={Math.max(width, height) * 0.002}
                          />
                        );
                      })}
                      {p.metrics.fixations.map((f, j) => (
                        <g key={j}>
                          <circle
                            cx={f.x * width}
                            cy={f.y * height}
                            r={
                              Math.max(width, height) *
                              (0.008 + Math.sqrt(f.durationMs / 1000) * 0.012)
                            }
                            fill={color}
                            fillOpacity={0.45}
                            stroke="white"
                            strokeWidth={1}
                          >
                            <title>
                              {p.participant} · #{j + 1} · {f.startMs}–{f.endMs}{" "}
                              ms · {f.durationMs} ms
                            </title>
                          </circle>
                          <text
                            x={f.x * width}
                            y={f.y * height}
                            dy=".35em"
                            textAnchor="middle"
                            fontSize={Math.max(width, height) * 0.012}
                            fill="white"
                            stroke="black"
                            strokeWidth={Math.max(width, height) * 0.001}
                            paintOrder="stroke"
                          >
                            {j + 1}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })
              : null}
            {view === "aois"
              ? aois.map((a) => (
                  <g key={a.id}>
                    <rect
                      x={a.box[0] * width}
                      y={a.box[1] * height}
                      width={(a.box[2] - a.box[0]) * width}
                      height={(a.box[3] - a.box[1]) * height}
                      fill="#06b6d422"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={a.box[0] * width + 4}
                      y={a.box[1] * height + width * 0.025}
                      fontSize={width * 0.02}
                      fill="white"
                      stroke="black"
                      strokeWidth={width * 0.002}
                      paintOrder="stroke"
                    >
                      {a.id} · {a.label}
                    </text>
                  </g>
                ))
              : null}
          </svg>
        </div>
      ) : (
        <p className="text-sm text-muted">
          No se pudo abrir la imagen almacenada.
        </p>
      )}
      <p className="text-xs text-muted">
        {view === "heatmap"
          ? "Amarillo → naranja → rojo: mayor intensidad relativa a esta selección. Se suman fijaciones por tiempo de exposición, sin ponderar por FPS. El heatmap es una visualización, no un KPI independiente."
          : view === "gaze"
            ? "Cada color representa una sesión. Los números indican el orden y el tamaño indica duración; las líneas unen fijaciones con señal continua de esa misma sesión. Selecciona un participante para leer su recorrido."
            : "Cada rectángulo delimita un elemento. Las AOI superpuestas se calculan de forma independiente; sus porcentajes pueden sumar más de 100 %."}
      </p>
      {!fixationCount ? (
        <p role="status" className="text-sm text-muted">
          Todavía no hay fijaciones detectables en esta selección.
        </p>
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Fijaciones detectadas</dt>
          <dd>{fmt(fixationCount, 0)}</dd>
        </div>
        <div>
          <dt className="text-muted">FD media</dt>
          <dd>
            {fmt(fixationCount ? totalDuration / fixationCount : null)} ms
          </dd>
        </div>
        <div>
          <dt className="text-muted">Amplitud entre fijaciones (estimada)</dt>
          <dd>
            {fmt(mean(transitions.map((t) => t.amplitudeDiagonalPct)))} % de
            diagonal
          </dd>
        </div>
        <div>
          <dt className="text-muted">Duración entre fijaciones (estimada)</dt>
          <dd>
            {fmt(mean(transitions.map((t) => t.durationMs)))} ms ·{" "}
            {transitions.length} transiciones
          </dd>
        </div>
      </dl>
      <h3 className="font-medium">
        KPIs por AOI ·{" "}
        {selected
          ? selected.participant
          : `agregado de ${aggregate.count} sesiones`}
      </h3>
      {aois.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Indicadores de atención por área de interés
            </caption>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {cells(row, visible.length).map((v, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="p-2">
                        {v}
                      </th>
                    ) : (
                      <td key={i} className="p-2">
                        {fmt(typeof v === "number" ? v : null)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Define las áreas de interés para calcular resultados por logotipo,
          producto, precio, mensaje o botón.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <button
          type="button"
          className="underline disabled:opacity-50"
          disabled={!aggregate.count || !aois.length}
          onClick={() =>
            download(
              `eye-kpis-${assetId}.csv`,
              ["asset_id", "base_sessions", "metrics_version", ...headers],
              aggregate.aois.map((r) => [
                assetId,
                aggregate.count,
                EYE_METRICS_VERSION,
                ...cells(r, aggregate.count),
              ]),
            )
          }
        >
          Descargar KPIs agregados CSV
        </button>
        <button
          type="button"
          className="underline disabled:opacity-50"
          disabled={!aggregate.count || !aois.length}
          onClick={() =>
            download(
              `eye-participantes-${assetId}.csv`,
              [
                "asset_id",
                "session_id",
                "participant",
                "metrics_version",
                ...headers,
              ],
              aggregate.participants.flatMap((p) =>
                p.metrics.aois.map((r) => [
                  assetId,
                  p.sessionId,
                  p.participant,
                  EYE_METRICS_VERSION,
                  ...cells(r, 1),
                ]),
              ),
            )
          }
        >
          Descargar KPIs por participante CSV
        </button>
        <button
          type="button"
          className="underline disabled:opacity-50"
          disabled={!fixationCount}
          onClick={() =>
            download(
              `eye-fijaciones-${assetId}.csv`,
              [
                "asset_id",
                "session_id",
                "participant",
                "fixation",
                "start_ms",
                "duration_ms",
                "x_norm",
                "y_norm",
                "aoi_ids",
                "transition_amplitude_diagonal_pct",
                "transition_duration_ms",
                "metrics_version",
              ],
              visible.flatMap((p) =>
                p.metrics.fixations.map((f, i) => {
                  const t = p.metrics.transitions.find((t) => t.to === i);
                  return [
                    assetId,
                    p.sessionId,
                    p.participant,
                    i + 1,
                    f.startMs,
                    f.durationMs,
                    f.x,
                    f.y,
                    aois
                      .filter(
                        (a) =>
                          f.x >= a.box[0] &&
                          f.x <= a.box[2] &&
                          f.y >= a.box[1] &&
                          f.y <= a.box[3],
                      )
                      .map((a) => a.id)
                      .join(" | "),
                    t?.amplitudeDiagonalPct,
                    t?.durationMs,
                    EYE_METRICS_VERSION,
                  ];
                }),
              ),
            )
          }
        >
          Descargar fijaciones y recorrido CSV
        </button>
      </div>
      <details className="space-y-2 text-sm">
        <summary className="cursor-pointer font-medium">
          Scanpath / secuencia de mirada
        </summary>
        {visible.map((p) => (
          <div key={p.sessionId} className="border-t border-border py-2">
            <p className="font-mono text-xs">{p.participant}</p>
            <ol className="flex flex-wrap gap-2">
              {p.metrics.fixations.map((f, i) => (
                <li
                  key={i}
                  className="rounded border border-border p-2 text-xs"
                >
                  {i + 1}.{" "}
                  {aois
                    .filter(
                      (a) =>
                        f.x >= a.box[0] &&
                        f.x <= a.box[2] &&
                        f.y >= a.box[1] &&
                        f.y <= a.box[3],
                    )
                    .map((a) => a.label)
                    .join(" / ") || "Fuera de AOI"}{" "}
                  · {f.startMs} ms · duración {f.durationMs} ms
                </li>
              ))}
            </ol>
            {!p.metrics.fixations.length ? (
              <p className="text-xs text-muted">Sin fijaciones detectables.</p>
            ) : null}
          </div>
        ))}
      </details>
      <EyeKpiGuide />
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">
          Definiciones y método de cálculo
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            {EYE_METRICS_VERSION}: I-DT con duración mínima 100 ms, dispersión
            máxima 3.5 % de la diagonal de la imagen y cortes de señal mayores
            de 100 ms. La ubicación de una fijación es su centroide ponderado
            por tiempo. Se analizan las lecturas guardadas, que pueden estar
            submuestreadas.
          </p>
          <p>
            TTFF: inicio de la primera fijación desde la aparición de la imagen,
            promediado sólo entre quienes fijaron esa AOI. FC, TFD, dwell,
            visitas y regresos: promedios por sesión, incluyendo ceros. FD:
            media de la duración de todas las fijaciones de esa AOI. Sin
            fijaciones, TTFF y FD aparecen como «sin dato».
          </p>
          <p>
            Una visita reúne fijaciones consecutivas dentro de una AOI sin
            salida ni corte de señal entre ellas. Dwell suma el tiempo desde la
            primera hasta la última fijación de cada visita, incluidos
            intervalos internos. TFD suma sólo las fijaciones. Regresos = máximo
            entre visitas − 1 y cero.
          </p>
          <p>
            Hit rate: porcentaje de sesiones con al menos una fijación en la
            AOI. Primera fijación: porcentaje cuya primera fijación de toda la
            imagen cayó en la AOI, aunque no hubiera otras. Base: sesiones
            incluidas con lecturas dentro de esta imagen; una sesión con
            lecturas pero sin fijaciones cuenta en el denominador. Cada sesión
            representa una participación; los posibles duplicados se revisan en
            la tabla de sesiones.
          </p>
          <p>
            Las transiciones muestran distancia entre centroides en % de
            diagonal y tiempo entre fin e inicio de fijaciones, sólo con señal
            continua. Son aproximaciones de exploración visual; el muestreo de
            webcam no resuelve la duración fisiológica de una sacada ni permite
            convertir su amplitud a grados sin geometría física.
          </p>
        </div>
      </details>
    </section>
  );
}
