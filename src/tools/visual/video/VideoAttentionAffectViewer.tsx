"use client";

import { useMemo, useRef, useState } from "react";
import { EvidenceBadge } from "@/components/ui/evidence-badge";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import {
  AU_KEYS,
  buildVideoSliceHeatmap,
  resolveVideoAoiBox,
  type AggregateVideoAoi,
  type AggregateVideoScene,
  type AuKey,
  type VideoTimelineBin,
} from "./metrics";
import type { VideoAoi, VideoObservation } from "./schema";

const AU_LABELS: Record<AuKey, string> = {
  au01: "AU01 · Inner Brow Raiser",
  au02: "AU02 · Outer Brow Raiser",
  au04: "AU04 · Brow Lowerer (Ceño)",
  au06: "AU06 · Cheek Raiser (Duchenne)",
  au07: "AU07 · Lid Tightener",
  au09: "AU09 · Nose Wrinkler",
  au10: "AU10 · Upper Lip Raiser",
  au12: "AU12 · Lip Corner Puller (Sonrisa)",
  au14: "AU14 · Dimpler",
  au15: "AU15 · Lip Corner Depressor",
  au24: "AU24 · Lip Pressor",
  au26: "AU26 · Jaw Drop (Apertura)",
};

export interface VideoAttentionAffectViewerProps {
  title: string;
  playbackUrl: string;
  durationMs: number;
  aois: VideoAoi[];
  aggregateAois: AggregateVideoAoi[];
  aggregateScenes: AggregateVideoScene[];
  timeline: VideoTimelineBin[];
  observations?: readonly VideoObservation[];
}

export function VideoAttentionAffectViewer({
  title,
  playbackUrl,
  durationMs,
  aois,
  aggregateAois,
  aggregateScenes,
  timeline,
  observations = [],
}: VideoAttentionAffectViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showAois, setShowAois] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const activeBin = useMemo(() => {
    if (!timeline.length) return null;
    return (
      timeline.find(
        (b) => currentTimeMs >= b.startMs && currentTimeMs <= b.endMs,
      ) ?? timeline[timeline.length - 1]
    );
  }, [currentTimeMs, timeline]);

  const activeAoiBoxes = useMemo(
    () =>
      aois.flatMap((aoi) => {
        const box = resolveVideoAoiBox(aoi, currentTimeMs);
        return box ? [{ aoi, box }] : [];
      }),
    [aois, currentTimeMs],
  );

  const sliceHeatmap = useMemo(() => {
    if (!showHeatmap || !observations.length || !activeBin) return [];
    return buildVideoSliceHeatmap(
      observations,
      activeBin.startMs,
      activeBin.endMs,
      24,
      14,
    );
  }, [activeBin, observations, showHeatmap]);

  const seekToMs = (ms: number) => {
    const clamped = Math.min(durationMs, Math.max(0, ms));
    setCurrentTimeMs(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
    }
  };

  const renderVideoStage = (isModal: boolean) => (
    <div
      className={`relative overflow-hidden rounded-lg border border-border bg-black shadow-xs ${
        isModal ? "max-h-[82vh] w-full" : "max-h-[min(60vh,520px)] w-full"
      }`}
    >
      <video
        ref={isModal ? undefined : videoRef}
        src={playbackUrl}
        controls
        playsInline
        className={`w-full object-contain ${
          isModal ? "max-h-[82vh]" : "max-h-[min(60vh,520px)]"
        }`}
        onTimeUpdate={(e) =>
          setCurrentTimeMs(Math.round(e.currentTarget.currentTime * 1000))
        }
      />

      {showHeatmap && sliceHeatmap.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          {sliceHeatmap.map((cell, i) => (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${cell.x * 100}%`,
                top: `${cell.y * 100}%`,
                width: "7%",
                height: "11%",
                background: `radial-gradient(circle, rgba(138,44,0,${0.65 * cell.strength}) 0%, rgba(255,180,0,0) 75%)`,
              }}
            />
          ))}
        </div>
      )}

      {showAois &&
        activeAoiBoxes.map(({ aoi, box }) => (
          <div
            key={aoi.id}
            className="pointer-events-none absolute rounded-md border-2 border-amber-400 bg-amber-500/15"
            style={{
              left: `${box[0] * 100}%`,
              top: `${box[1] * 100}%`,
              width: `${(box[2] - box[0]) * 100}%`,
              height: `${(box[3] - box[1]) * 100}%`,
            }}
          >
            <span className="inline-block rounded-br bg-deep/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {aoi.label}
            </span>
          </div>
        ))}
    </div>
  );

  const tabItems = [
    {
      id: "affect",
      label: "Índices y AUs",
      content: (
        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
              <EvidenceBadge kind="modeled" /> Índices compuestos (
              {activeBin
                ? `${(activeBin.startMs / 1000).toFixed(1)}–${(activeBin.endMs / 1000).toFixed(1)} s`
                : "—"}
              )
            </h4>
            <dl className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <dt className="text-muted">Valencia Facial (-100..100)</dt>
                <dd className="mt-1 font-display text-lg font-bold text-heading tabular-nums">
                  {activeBin?.meanValence ?? "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <dt className="text-muted">Sonrisa / Afinidad (0..100)</dt>
                <dd className="mt-1 font-display text-lg font-bold text-heading tabular-nums">
                  {activeBin?.meanSmile ?? "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <dt className="text-muted">Ceño / Esfuerzo (0..100)</dt>
                <dd className="mt-1 font-display text-lg font-bold text-heading tabular-nums">
                  {activeBin?.meanFriction ?? "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <dt className="text-muted">Sorpresa / Apertura (0..100)</dt>
                <dd className="mt-1 font-display text-lg font-bold text-heading tabular-nums">
                  {activeBin?.meanSurprise ?? "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <h4 className="mb-3 text-xs font-semibold text-muted">
              12 Action Units (FACS · fc-blendshape-v1)
            </h4>
            <div className="grid grid-cols-1 gap-y-1 text-xs sm:grid-cols-2 sm:gap-x-4">
              {AU_KEYS.map((key) => {
                const score = activeBin?.meanAus?.[key] ?? 0;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between border-b border-border/50 py-1.5"
                  >
                    <span className="truncate text-muted">{AU_LABELS[key]}</span>
                    <span className="font-semibold text-heading tabular-nums">
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ),
    },
    {
      id: "aois",
      label: "AOIs dinámicas",
      count: aggregateAois.length,
      content: (
        <Card className="p-4">
          <h4 className="mb-3 text-xs font-semibold text-muted">
            Atribución Gaze-Locked Affect por AOI
          </h4>
          {aggregateAois.length === 0 ? (
            <p className="text-xs text-muted">
              No hay áreas de interés definidas para este video.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-2 pr-3">AOI</th>
                    <th className="py-2 pr-3">Ventana</th>
                    <th className="py-2 pr-3">Hit Rate</th>
                    <th className="py-2 pr-3">TTFF</th>
                    <th className="py-2 pr-3">Dwell</th>
                    <th className="py-2 pr-3">Valencia</th>
                    <th className="py-2 pr-3">Sonrisa</th>
                    <th className="py-2">Ceño</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateAois.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border/50 hover:bg-surface-muted/50"
                      onClick={() => seekToMs(row.startMs)}
                    >
                      <td className="py-2 pr-3 font-medium text-heading">
                        {row.label}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {(row.startMs / 1000).toFixed(1)}–
                        {(row.endMs / 1000).toFixed(1)} s
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.hitRatePct !== null ? `${row.hitRatePct}%` : "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.ttffMs !== null
                          ? `${Math.round(row.ttffMs)} ms`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {Math.round(row.dwellTimeMs)} ms
                      </td>
                      <td className="py-2 pr-3 font-semibold tabular-nums">
                        {row.affectWhileLooking?.valence ?? "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.affectWhileLooking?.smile ?? "—"}
                      </td>
                      <td className="py-2 tabular-nums">
                        {row.affectWhileLooking?.aus.au04 ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ),
    },
    {
      id: "scenes",
      label: "Escenas",
      count: aggregateScenes.length,
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
          {aggregateScenes.length === 0 ? (
            <Card className="p-4 sm:col-span-2">
              <p className="text-xs text-muted">
                No hay escenas segmentadas para este video.
              </p>
            </Card>
          ) : (
            aggregateScenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => seekToMs(scene.startMs)}
                className="rounded-xl border border-border bg-surface p-3.5 text-left text-xs transition hover:border-primary/60 hover:bg-surface-muted/40"
              >
                <div className="flex items-center justify-between font-semibold text-heading">
                  <span>{scene.label}</span>
                  <span className="text-muted tabular-nums">
                    {(scene.startMs / 1000).toFixed(1)}–
                    {(scene.endMs / 1000).toFixed(1)} s
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-muted">
                  <span>
                    Mirada:{" "}
                    <strong className="text-heading">
                      {Math.round(scene.meanGazeCoverageRatio * 100)}%
                    </strong>
                  </span>
                  <span>
                    Parpadeos/min:{" "}
                    <strong className="text-heading">
                      {scene.meanBlinkRatePerMin}
                    </strong>
                  </span>
                  <span>
                    Valencia:{" "}
                    <strong className="text-heading">
                      {scene.meanAffect?.valence ?? "—"}
                    </strong>
                  </span>
                  <span>
                    Sorpresa:{" "}
                    <strong className="text-heading">
                      {scene.meanAffect?.surprise ?? "—"}
                    </strong>
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* Columna izquierda sticky: visor contenido + barra compacta + línea de tiempo */}
      <div className="space-y-3 lg:sticky lg:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-heading">{title}</span>
            <span className="text-xs text-muted tabular-nums">
              {(currentTimeMs / 1000).toFixed(2)} /{" "}
              {(durationMs / 1000).toFixed(1)} s
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-border bg-surface-muted/30 p-0.5"
              role="group"
              aria-label="Capas de video"
            >
              <button
                type="button"
                aria-pressed={showHeatmap}
                onClick={() => setShowHeatmap((v) => !v)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  showHeatmap
                    ? "border border-border/80 bg-surface text-accent-ink shadow-2xs"
                    : "text-muted hover:text-heading"
                }`}
              >
                Heatmap
              </button>
              <button
                type="button"
                aria-pressed={showAois}
                onClick={() => setShowAois((v) => !v)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  showAois
                    ? "border border-border/80 bg-surface text-accent-ink shadow-2xs"
                    : "text-muted hover:text-heading"
                }`}
              >
                AOIs
              </button>
            </div>

            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Fullscreen"
              title="Ver a pantalla completa"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-muted/40 px-2.5 text-xs font-medium text-heading transition hover:border-primary/40 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-heading"
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
              <span>Fullscreen</span>
            </button>
          </div>
        </div>

        {renderVideoStage(false)}

        <Card className="p-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Línea de tiempo sincronizada (clic para saltar al instante):
          </p>
          <div className="grid grid-cols-12 gap-1 sm:grid-cols-20">
            {timeline.map((bin) => {
              const isCurrent =
                currentTimeMs >= bin.startMs && currentTimeMs <= bin.endMs;
              const val = bin.meanValence ?? 0;
              const barColor =
                val >= 15
                  ? "bg-primary/80"
                  : val <= -15
                    ? "bg-amber-600/80"
                    : "bg-foreground/30";
              return (
                <button
                  key={bin.startMs}
                  type="button"
                  onClick={() => seekToMs(bin.startMs)}
                  title={`${(bin.startMs / 1000).toFixed(1)}s · Valencia: ${bin.meanValence ?? "—"} · Sonrisa: ${bin.meanSmile ?? "—"} · Fricción: ${bin.meanFriction ?? "—"}`}
                  className={`flex h-10 flex-col justify-end rounded border p-0.5 transition ${
                    isCurrent
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/60"
                  }`}
                >
                  <div
                    className={`w-full rounded-sm ${barColor}`}
                    style={{
                      height: `${Math.max(15, Math.min(100, Math.abs(val)))}%`,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Columna derecha: pestañas segmentadas al estilo del rediseño visual */}
      <Tabs
        label="Análisis multimodal de video"
        variant="segmented"
        gridColumns="1.2fr 1.1fr 0.9fr"
        items={tabItems}
      />

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} en pantalla completa`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
        >
          <div className="flex w-full max-w-6xl items-center justify-between text-white">
            <span className="text-sm font-semibold">{title}</span>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              Cerrar
            </button>
          </div>
          <div className="w-full max-w-6xl">{renderVideoStage(true)}</div>
        </div>
      )}
    </div>
  );
}
