"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { analyzeAsset } from "../actions";
import { AnalysisActivity } from "./analysis-activity";

export interface BatchAsset {
  id: string;
  title: string;
  url?: string;
  width: number;
  height: number;
  analyzed: boolean;
  reviewed: boolean;
  placement?: string;
  strength?: string;
  weakness?: string;
}
type ItemState = {
  status: "queued" | "running" | "success" | "error";
  message?: string;
};
const LABELS = {
  queued: "En espera",
  running: "Analizando…",
  success: "Análisis guardado",
  error: "Falló el análisis",
};
const TONES = {
  queued: "neutral",
  running: "neuro",
  success: "success",
  error: "danger",
} as const;

/** One server action per image: bounded request duration and separately saved
 * results. Stopping prevents later requests; it never claims to abort an active model call. */
export function AssetAnalysisBatch({
  studyId,
  assets,
}: {
  studyId: string;
  assets: BatchAsset[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [batch, setBatch] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  // Progress updates must render while a model request is pending, rather than
  // waiting for one long React transition spanning the entire batch.
  const [pending, setPending] = useState(false);
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const router = useRouter();
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRef.current = true;
    };
  }, []);
  const ids = new Set(assets.map((a) => a.id));
  const selection = selected.filter((id) => ids.has(id));
  const failed = assets
    .filter((a) => items[a.id]?.status === "error")
    .map((a) => a.id);
  const queued = assets
    .filter((a) => items[a.id]?.status === "queued")
    .map((a) => a.id);
  const completed = batch.filter(
    (id) => items[id]?.status === "success" || items[id]?.status === "error",
  ).length;
  const successful = batch.filter(
    (id) => items[id]?.status === "success",
  ).length;
  const current = batch.find((id) => items[id]?.status === "running");

  const run = async () => {
    if (pending || runningRef.current || !selection.length) return;
    runningRef.current = true;
    setPending(true);
    const queue = [...selection];
    stopRef.current = false;
    setStopping(false);
    setMessage(null);
    setBatch(queue);
    setItems((previous) => ({
      ...previous,
      ...Object.fromEntries(
        queue.map((id) => [id, { status: "queued" as const }]),
      ),
    }));
    try {
      let successes = 0,
        failures = 0;
      for (const id of queue) {
        if (stopRef.current || !mountedRef.current) break;
        setItems((previous) => ({ ...previous, [id]: { status: "running" } }));
        const fd = new FormData();
        fd.set("studyId", studyId);
        fd.set("assetId", id);
        try {
          const result = await analyzeAsset({}, fd);
          if (!mountedRef.current) return;
          if (result.ok) {
            successes++;
            setItems((previous) => ({
              ...previous,
              [id]: { status: "success", message: result.message },
            }));
          } else {
            failures++;
            setItems((previous) => ({
              ...previous,
              [id]: {
                status: "error",
                message:
                  result.error ?? "No se confirmó el guardado del análisis.",
              },
            }));
            if (result.code === "rate_limit") {
              stopRef.current = true;
            }
          }
        } catch {
          if (!mountedRef.current) return;
          failures++;
          setItems((previous) => ({
            ...previous,
            [id]: {
              status: "error",
              message:
                "No se pudo completar la solicitud. Revisa la conexión y reintenta esta imagen.",
            },
          }));
        }
      }
      if (!mountedRef.current) return;
      setStopping(false);
      setMessage(
        `${stopRef.current ? "Lote detenido" : "Lote terminado"}: ${successes} análisis guardados · ${failures} fallidos · ${queue.length - successes - failures} pendientes.`,
      );
      router.refresh();
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Análisis de imágenes por lote">
      <Card className="space-y-3 print:hidden">
        <div>
          <h2 className="font-medium">Analizar imágenes con IA</h2>
          <p className="text-sm text-muted">
            Selecciona las piezas y analiza todo el lote. Cada resultado se
            guarda por separado. Mantén esta página abierta hasta terminar;
            puedes detener el lote después de la imagen en curso. Se mantiene el
            límite del estudio de 30 imágenes analizadas por hora.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setSelected(assets.map((a) => a.id))}
          >
            Seleccionar todas
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              setSelected(
                assets
                  .filter(
                    (a) => !a.analyzed && items[a.id]?.status !== "success",
                  )
                  .map((a) => a.id),
              )
            }
          >
            Sólo sin analizar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !selection.length}
            onClick={() => setSelected([])}
          >
            Limpiar selección
          </Button>
          {failed.length ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setSelected(failed)}
            >
              Seleccionar fallidas ({failed.length})
            </Button>
          ) : null}
          {queued.length && !pending ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelected(queued)}
            >
              Seleccionar pendientes ({queued.length})
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pending || !selection.length}
            onClick={run}
          >
            {pending
              ? "Analizando lote…"
              : `Analizar seleccionadas (${selection.length})`}
          </Button>
          {pending ? (
            <Button
              type="button"
              variant="secondary"
              disabled={stopping}
              onClick={() => {
                stopRef.current = true;
                setStopping(true);
              }}
            >
              {stopping
                ? "Se detendrá al finalizar esta imagen…"
                : "Detener después de esta imagen"}
            </Button>
          ) : null}
          {selection.some(
            (id) =>
              assets.find((a) => a.id === id)?.analyzed ||
              items[id]?.status === "success",
          ) ? (
            <p className="text-xs text-muted">
              La selección incluye imágenes ya analizadas: se actualizará su
              lectura con IA y se conservarán las AOI revisadas.
            </p>
          ) : null}
        </div>
        <p
          role="status"
          aria-label="Progreso del análisis por lote"
          className="text-sm"
        >
          {pending
            ? `${completed} de ${batch.length} procesadas · ${successful} guardadas${current ? ` · En curso: ${assets.find((a) => a.id === current)?.title ?? "imagen"}` : ""}`
            : (message ?? `${selection.length} imágenes seleccionadas.`)}
        </p>
        {batch.length ? (
          <progress
            className="h-2 w-full accent-primary"
            value={completed}
            max={batch.length}
            aria-label="Imágenes procesadas"
          />
        ) : null}
        {pending && current ? <AnalysisActivity key={current} /> : null}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const state = items[asset.id];
          return (
            <Card
              key={asset.id}
              className={`h-full space-y-3 p-3 ${selection.includes(asset.id) ? "ring-2 ring-primary" : ""}`}
            >
              <label className="flex items-center gap-2 text-sm print:hidden">
                <input
                  type="checkbox"
                  checked={selection.includes(asset.id)}
                  disabled={pending}
                  onChange={(e) =>
                    setSelected((previous) =>
                      e.target.checked
                        ? [...previous, asset.id]
                        : previous.filter((id) => id !== asset.id),
                    )
                  }
                />
                <span>Seleccionar {asset.title}</span>
              </label>
              <Link
                href={`/studies/${studyId}/assets/${asset.id}`}
                className="group block space-y-2"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded bg-foreground/5">
                  {asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed private Storage URL
                    <img
                      src={asset.url}
                      alt={asset.title}
                      className="absolute inset-0 size-full object-contain object-top"
                      loading="lazy"
                    />
                  ) : null}
                  {state?.status === "running" ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-sm font-medium">
                      <span aria-hidden="true" className="size-5 rounded-full border-2 border-primary/25 border-t-primary motion-safe:animate-spin" />
                      Analizando esta imagen…
                    </div>
                  ) : null}
                </div>
                <p className="truncate font-medium group-hover:underline">
                  {asset.title}
                </p>
                <p className="text-xs text-muted">
                  {asset.width}×{asset.height}
                  {asset.placement ? ` · ${asset.placement}` : ""}
                </p>
              </Link>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  tone={
                    state
                      ? TONES[state.status]
                      : asset.analyzed
                        ? "success"
                        : "neutral"
                  }
                >
                  {state
                    ? LABELS[state.status]
                    : asset.analyzed
                      ? "Analizada"
                      : "Sin analizar"}
                </StatusBadge>
                {asset.reviewed ? (
                  <StatusBadge tone="neutral">AOI revisadas</StatusBadge>
                ) : null}
              </div>
              {state?.message ? (
                <p
                  className={`text-xs ${state.status === "error" ? "text-danger" : "text-muted"}`}
                >
                  {state.message}
                </p>
              ) : null}
              {asset.strength ? (
                <p className="text-xs">
                  <strong>Acierto:</strong> {asset.strength}
                </p>
              ) : null}
              {asset.weakness ? (
                <p className="text-xs">
                  <strong>Debilidad principal:</strong> {asset.weakness}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
      {!assets.length ? <Alert>No hay imágenes para analizar.</Alert> : null}
    </section>
  );
}
