"use client";

import { Button, buttonClass } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/ui/evidence-badge";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

const HEADER_HINTS: Record<string, string> = {
  AOI: "Área de interés evaluada",
  "TTFF (ms)": "Tiempo hasta la primera fijación (milisegundos)",
  FC: "Conteo total de fijaciones dentro del área",
  "FD media (ms)": "Duración promedio de cada fijación (milisegundos)",
  "TFD (ms)": "Tiempo total de fijación acumulado (milisegundos)",
  "Dwell (ms)": "Tiempo de permanencia continua en el área (milisegundos)",
  "Hit rate (%)": "Porcentaje de participantes que miraron el área",
  "Primera fijación (%)": "Porcentaje cuya primera mirada cayó en esta área",
  Visitas: "Número de entradas distintas al área",
  Regresos: "Veces que la mirada volvió al área tras salir",
};

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
  maxHeight = "min(60vh, 520px)",
}: {
  studyId: string;
  assetId: string;
  title: string;
  imageUrl?: string;
  width: number;
  height: number;
  aois: Aoi[];
  participants: EyeParticipant[];
  maxHeight?: string;
}) {
  const [view, setView] = useState<"heatmap" | "gaze" | "aois">("heatmap");
  const [heatMetric, setHeatMetric] = useState<"count" | "duration">(
    "duration",
  );
  const [session, setSession] = useState("all");
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
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

  const handleZoomIn = () =>
    setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));

  const handleZoomOut = () =>
    setZoom((z) => {
      const next = Math.max(1, Number((z - 0.25).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const [activeHint, setActiveHint] = useState<string | null>(null);
  const csvMenuRef = useRef<HTMLDetailsElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeFullscreen = () => {
    setFullscreen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(() => previousFocusRef.current?.focus());
  };

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (csvMenuRef.current?.open && !csvMenuRef.current.contains(e.target as Node)) {
        csvMenuRef.current.open = false;
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && csvMenuRef.current?.open) {
        csvMenuRef.current.open = false;
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFullscreen();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY;
    if (delta < 0) {
      handleZoomIn();
    } else if (delta > 0) {
      handleZoomOut();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    const limitX = Math.max(120, (window.innerWidth * (zoom - 1)) / 1.5);
    const limitY = Math.max(120, (window.innerHeight * (zoom - 1)) / 1.5);
    setPan({
      x: Math.max(-limitX, Math.min(limitX, rawX)),
      y: Math.max(-limitY, Math.min(limitY, rawY)),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // noop
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  };

  const onDoubleClick = () => {
    if (zoom > 1) {
      handleResetZoom();
    } else {
      setZoom(2);
    }
  };

  const ratio = width / height;

  const renderSvg = (idSuffix = "", isAriaHidden = false) => {
    const gid = `${gradientId}${idSuffix}`;
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role={isAriaHidden ? undefined : "img"}
        aria-hidden={isAriaHidden ? true : undefined}
        aria-label={
          isAriaHidden
            ? undefined
            : view === "heatmap"
              ? `Mapa de calor por ${heatMetric === "duration" ? "duración" : "número"} de fijaciones`
              : view === "gaze"
                ? "Secuencia de fijaciones por participante"
                : "Áreas de interés delimitadas"
        }
        className="pointer-events-none absolute inset-0 size-full"
      >
        <defs>
          <radialGradient id={gid}>
            <stop offset="0" stopColor="#8a2c00" stopOpacity="0.85" />
            <stop offset="0.4" stopColor="#ff6a00" stopOpacity="0.65" />
            <stop offset="0.7" stopColor="#ffb000" stopOpacity="0.38" />
            <stop offset="1" stopColor="#fff7e6" stopOpacity="0" />
          </radialGradient>
        </defs>
        {view === "heatmap"
          ? heat.map((cell, i) => (
              <circle
                key={i}
                cx={cell.x * width}
                cy={cell.y * height}
                r={Math.hypot(width, height) * 0.045}
                fill={`url(#${gid})`}
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
                    const from = p.metrics.fixations[t.from];
                    const to = p.metrics.fixations[t.to];
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
                          {p.participant} · #{j + 1} · {f.startMs}–{f.endMs} ms
                          · {f.durationMs} ms
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
                  fill="#FFB00024"
                  stroke="#FFB000"
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
    );
  };

  return (
    <section className="space-y-4" aria-label={`Resultados de ${title}`}>
      {/* Encabezado con conteo y enlace directo a edición de AOIs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-heading">{title}</h2>
            {aggregate.count ? <EvidenceBadge kind="measured" /> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {aggregate.count}{" "}
            {aggregate.count === 1
              ? "sesión con lecturas"
              : "sesiones con lecturas"}{" "}
            · {aggregate.withoutFixations} sin fijaciones detectadas ·{" "}
            {participants.length - aggregate.count} registros sin lecturas o
            repetidos fuera del agregado
          </p>
        </div>
        <Link
          href={`/studies/${studyId}/assets/${assetId}`}
          className={buttonClass("secondary", "", "sm")}
        >
          <span>Definir áreas de interés ({aois.length})</span>
        </Link>
      </div>

      {/* Barra de herramientas compacta y estilizada */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span>Participante</span>
            <select
              aria-label="Participante"
              className="min-h-11 rounded-md border border-border bg-surface-muted/50 px-2.5 pr-7 text-xs font-semibold text-heading shadow-2xs transition hover:border-primary/50 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink cursor-pointer"
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
            className="inline-flex rounded-full border border-border bg-surface-muted/30 p-0.5"
            role="group"
            aria-label="Visualización"
          >
            {(
              [
                ["heatmap", "Calor"],
                ["gaze", "Recorrido"],
                ["aois", "Áreas de interés"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`min-h-11 rounded-full px-3 text-xs font-semibold transition motion-reduce:transition-none ${
                  view === id
                    ? "bg-primary text-primary-foreground shadow-2xs border border-border/80"
                    : "text-muted hover:text-heading"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "heatmap" ? (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <span>Métrica del mapa</span>
              <select
                aria-label="Métrica del mapa"
                value={heatMetric}
                onChange={(e) =>
                  setHeatMetric(e.target.value as "count" | "duration")
                }
                className="min-h-11 rounded-md border border-border bg-surface-muted/50 px-2.5 pr-7 text-xs font-semibold text-heading shadow-2xs transition hover:border-primary/50 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink cursor-pointer"
              >
                <option value="duration">Duración de fijaciones</option>
                <option value="count">Número de fijaciones</option>
              </select>
            </label>
          ) : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFullscreen(true)}
          title="Ver a pantalla completa"
          aria-label="Pantalla completa"
        >
          <svg
            aria-hidden="true"
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
          <span>Pantalla completa</span>
        </Button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-3">
          {/* Contenedor de la imagen con contención estricta de altura */}
          {imageUrl ? (
            <div
              className="relative overflow-hidden rounded-lg border border-border bg-foreground/5 shadow-xs"
              style={{
                aspectRatio: `${width} / ${height}`,
                maxHeight,
                maxWidth: `min(100%, calc(${maxHeight} * ${ratio}))`,
                width: "100%",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private storage URL */}
              <img
                src={imageUrl}
                alt={title}
                className="absolute inset-0 size-full"
                draggable={false}
              />
              {renderSvg("", false)}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No se pudo abrir la imagen almacenada.
            </p>
          )}
          {view === "gaze" && visible.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Leyenda de participantes en recorrido">
              {visible.map((p, idx) => (
                <li key={p.sessionId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-heading">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: `hsl(${(idx * 137.5) % 360}, 75%, 52%)` }}
                  />
                  <span>{p.participant}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Nota explicativa del modo activo */}
          <p className="text-xs text-muted">
            {view === "heatmap"
              ? "Crema a café indica intensidad creciente dentro de esta selección. Las fijaciones se ponderan por tiempo de exposición. La escala cambia con la selección."
              : view === "gaze"
                ? "Cada color representa una sesión. Los números indican el orden y el tamaño indica duración; las líneas unen fijaciones con señal continua de esa misma sesión. Selecciona un participante para leer su recorrido."
                : "Cada rectángulo delimita un elemento. Las AOI superpuestas se calculan de forma independiente; sus porcentajes pueden sumar más de 100 %."}
          </p>

          {view === "heatmap" && fixationCount > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              Poca mirada{" "}
              <span
                aria-hidden="true"
                className="h-2 flex-1 rounded-full bg-[linear-gradient(to_right,#fff7e6,#ffb000,#ff6a00,#8a2c00)]"
              />{" "}
              Mucha mirada
            </div>
          ) : null}

          {!fixationCount ? (
            <p role="status" className="text-sm text-muted">
              Todavía no hay fijaciones detectables en esta selección.
            </p>
          ) : null}
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="text-base font-bold">Fijaciones y recorrido</h3>
          {/* Tarjetas rápidas de KPIs */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface/60 p-3 shadow-2xs">
              <dt className="text-xs font-medium text-muted">
                Fijaciones detectadas
              </dt>
              <dd className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {fmt(fixationCount, 0)}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3 shadow-2xs">
              <dt className="text-xs font-medium text-muted">FD media</dt>
              <dd className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {fmt(fixationCount ? totalDuration / fixationCount : null)} ms
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3 shadow-2xs">
              <dt className="text-xs font-medium text-muted">
                Amplitud entre fijaciones
              </dt>
              <dd className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {fmt(mean(transitions.map((t) => t.amplitudeDiagonalPct)))}{" "}
                <span className="text-xs font-normal text-muted">
                  % diagonal
                </span>
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface/60 p-3 shadow-2xs">
              <dt className="text-xs font-medium text-muted">
                Duración entre fijaciones
              </dt>
              <dd className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {fmt(mean(transitions.map((t) => t.durationMs)))}{" "}
                <span className="text-xs font-normal text-muted">
                  ms ({transitions.length} trans.)
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Tabla de KPIs por AOI con botones de descarga */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-heading">
            KPIs por AOI ·{" "}
            <span className="font-normal text-muted">
              {selected
                ? selected.participant
                : `agregado de ${aggregate.count} sesiones`}
            </span>
          </h3>
          <details ref={csvMenuRef} className="relative">
            <summary className={buttonClass("secondary", "cursor-pointer list-none", "sm")}>
              <svg
                aria-hidden="true"
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Exportar CSV</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-lg">
              <button
                type="button"
                className="min-h-10 rounded-xl px-3 py-2 text-left text-xs font-medium text-heading transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!aggregate.count || !aois.length}
                onClick={() => {
                  if (csvMenuRef.current) csvMenuRef.current.open = false;
                  download(
                    `eye-kpis-${assetId}.csv`,
                    ["asset_id", "base_sessions", "metrics_version", ...headers],
                    aggregate.aois.map((r) => [
                      assetId,
                      aggregate.count,
                      EYE_METRICS_VERSION,
                      ...cells(r, aggregate.count),
                    ]),
                  );
                }}
              >
                KPIs agregados CSV
              </button>
              <button
                type="button"
                className="min-h-10 rounded-xl px-3 py-2 text-left text-xs font-medium text-heading transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!aggregate.count || !aois.length}
                onClick={() => {
                  if (csvMenuRef.current) csvMenuRef.current.open = false;
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
                  );
                }}
              >
                KPIs por participante CSV
              </button>
              <button
                type="button"
                className="min-h-10 rounded-xl px-3 py-2 text-left text-xs font-medium text-heading transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!fixationCount}
                onClick={() => {
                  if (csvMenuRef.current) csvMenuRef.current.open = false;
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
                  );
                }}
              >
                Fijaciones y recorrido CSV
              </button>
            </div>
          </details>
        </div>

        {aois.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-2xs">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Indicadores de atención por área de interés
              </caption>
              <thead className="border-b border-border bg-surface-muted/50 text-xs font-semibold text-muted">
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      title={HEADER_HINTS[h]}
                      className="whitespace-nowrap px-3 py-2.5"
                    >
                      {h !== "AOI" && HEADER_HINTS[h] ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{h}</span>
                          <button
                            type="button"
                            aria-expanded={activeHint === h}
                            aria-label={`Definición de ${h}`}
                            title={HEADER_HINTS[h]}
                            onClick={() => setActiveHint((prev) => (prev === h ? null : h))}
                            className="inline-flex size-5 items-center justify-center rounded-full border border-border text-xs font-bold text-muted hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink print:hidden"
                          >
                            ?
                          </button>
                        </span>
                      ) : (
                        h
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-foreground/2">
                    {cells(row, visible.length).map((v, i) =>
                      i === 0 ? (
                        <th
                          key={i}
                          scope="row"
                          className="whitespace-nowrap px-3 py-2 font-medium text-heading"
                        >
                          {v}
                        </th>
                      ) : (
                        <td
                          key={i}
                          className="whitespace-nowrap px-3 py-2 tabular-nums"
                        >
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
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-6 text-center">
            <p className="text-sm text-muted">
              Define las áreas de interés para calcular resultados por logotipo,
              producto, precio, mensaje o botón.
            </p>
          </div>
        )}
        {activeHint && HEADER_HINTS[activeHint] ? (
          <p role="status" className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-xs text-heading">
            <strong className="font-semibold">{activeHint}:</strong> {HEADER_HINTS[activeHint]}
          </p>
        ) : null}
      </div>

      <EyeKpiGuide />

      {/* Desplegable de scanpath / secuencia */}
      <details className="group rounded-lg border border-border bg-surface/40 p-3.5 shadow-2xs">
        <summary className="flex cursor-pointer items-center justify-between font-medium text-sm text-heading hover:text-accent-ink">
          <span>Scanpath / secuencia de mirada</span>
          <span className="text-xs text-muted group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="mt-3 space-y-3 pt-2">
          {visible.map((p) => (
            <div
              key={p.sessionId}
              className="rounded-md border border-border/80 bg-background/50 p-3"
            >
              <p className="font-mono text-xs font-medium text-heading">
                {p.participant}
              </p>
              <ol className="mt-2 flex flex-wrap gap-2">
                {p.metrics.fixations.map((f, i) => (
                  <li
                    key={i}
                    className="rounded border border-border bg-surface px-2.5 py-1 text-xs text-heading"
                  >
                    <span className="font-semibold text-accent-ink">
                      {i + 1}.
                    </span>{" "}
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
                    · {f.startMs} ms · {f.durationMs} ms
                  </li>
                ))}
              </ol>
              {!p.metrics.fixations.length ? (
                <p className="mt-1 text-xs text-muted">
                  Sin fijaciones detectables.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </details>

      {/* Desplegable de definiciones y método */}
      <details className="group rounded-lg border border-border bg-surface/40 p-3.5 shadow-2xs text-xs text-muted">
        <summary className="flex cursor-pointer items-center justify-between font-medium text-heading hover:text-accent-ink">
          <span>Definiciones y método de cálculo</span>
          <span className="text-xs text-muted group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="mt-3 space-y-2 pt-2 border-t border-border">
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

      {/* Modal a pantalla completa (lightbox) */}
      {fullscreen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Visor de miradas a pantalla completa"
          onKeyDown={(e) => {
            if (e.key !== "Tab" || !dialogRef.current) return;
            const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col bg-deep/95 p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 text-white">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                <span>Participante</span>
                <select
                  aria-label="Participante en pantalla completa"
                  className="min-h-11 rounded-md border border-white/20 bg-deep-surface px-2.5 text-xs font-medium text-white shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                >
                  <option value="all" className="bg-neutral-900 text-white">
                    Todos (agregado)
                  </option>
                  {aggregate.participants.map((p) => (
                    <option
                      key={p.sessionId}
                      value={p.sessionId}
                      className="bg-neutral-900 text-white"
                    >
                      {p.participant}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Visualización en pantalla completa"
              >
                {(
                  [
                    ["heatmap", "Calor"],
                    ["gaze", "Recorrido"],
                    ["aois", "Áreas de interés"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={view === id}
                    onClick={() => setView(id)}
                    className={`min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition motion-reduce:transition-none ${
                      view === id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/30 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === "heatmap" ? (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <span>Métrica</span>
                  <select
                    aria-label="Métrica del mapa en pantalla completa"
                    value={heatMetric}
                    onChange={(e) =>
                      setHeatMetric(e.target.value as "count" | "duration")
                    }
                    className="min-h-11 rounded-md border border-white/20 bg-deep-surface px-2.5 text-xs font-medium text-white shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                  >
                    <option
                      value="duration"
                      className="bg-neutral-900 text-white"
                    >
                      Duración de fijaciones
                    </option>
                    <option value="count" className="bg-neutral-900 text-white">
                      Número de fijaciones
                    </option>
                  </select>
                </label>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              {/* Controles de Zoom */}
              <div
                className="flex items-center gap-1 rounded-full border border-white/20 bg-deep-surface p-1"
                role="group"
                aria-label="Control de zoom"
              >
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                  title="Alejar (-)"
                  aria-label="Alejar zoom"
                  className="inline-flex size-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg
                    aria-hidden="true"
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Restablecer zoom al 100% (0)"
                  aria-label={`Nivel de zoom: ${Math.round(zoom * 100)}%`}
                  className="min-h-11 min-w-12 px-1 text-center font-mono text-xs font-semibold tabular-nums text-white/90 transition hover:text-white"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 4}
                  title="Acercar (+)"
                  aria-label="Acercar zoom"
                  className="inline-flex size-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg
                    aria-hidden="true"
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={closeFullscreen}
                className="inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-xs font-semibold text-white hover:bg-white/25 transition"
              >
                Cerrar ✕
              </button>
            </div>
          </div>

          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden select-none"
            onWheel={onWheel}
          >
            <div
              className={`relative mx-auto overflow-hidden rounded-lg shadow-2xl transition-transform ${
                zoom > 1
                  ? `touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`
                  : "cursor-default"
              }`}
              style={{
                aspectRatio: `${width} / ${height}`,
                maxHeight: "calc(100vh - 6.5rem)",
                maxWidth: `min(94vw, calc((100vh - 6.5rem) * ${ratio}))`,
                width: "100%",
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 150ms ease-out",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={title}
                className="absolute inset-0 size-full pointer-events-none select-none"
                draggable={false}
              />
              {renderSvg("-fs", true)}
            </div>

            {zoom > 1 ? (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-deep/90 px-3 py-1.5 text-2xs text-white/90 shadow-lg">
                Arrastra para explorar · Doble clic para restablecer (0)
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
