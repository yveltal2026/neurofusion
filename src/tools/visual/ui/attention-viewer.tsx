"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveAois } from "../actions";
import { AOI_KIND_LABEL, AOI_KINDS, attentionField, coldZones, focalPoint, gazePath, heatColor, LOW_ATTENTION, outsidePath, type Aoi, type AoiKind, type ColdZone } from "../engine/aoi";

export type ViewMode = "original" | "heatmap" | "gaze" | "blind" | "boxes";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "heatmap", label: "Mapa de atención" },
  { id: "gaze", label: "Recorrido" },
  { id: "blind", label: "Zonas ciegas" },
  { id: "boxes", label: "Áreas de interés" },
];

const MAX_CANVAS = 1400;

function draw(ctx: CanvasRenderingContext2D, mode: ViewMode, aois: Aoi[], selected: string | null, draft: Aoi["box"] | null) {
  const cold = coldZones(aois);
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const s = W / 800;
  const px = (b: Aoi["box"]) => [b[0] * W, b[1] * H, (b[2] - b[0]) * W, (b[3] - b[1]) * H] as const;
  // Rótulos: se recortan al ancho útil, no se salen de la imagen y no se encima uno sobre otro.
  const placed: [number, number, number, number][] = [];
  const label = (text: string, x: number, y: number, bg: string) => {
    ctx.font = `600 ${Math.round(13 * s)}px system-ui, sans-serif`;
    const h = 18 * s;
    const maxW = Math.min(W - 8 * s, 260 * s);
    let t = text;
    while (t.length > 4 && ctx.measureText(t).width + 8 * s > maxW) t = `${t.slice(0, -2).trimEnd()}…`;
    const w = ctx.measureText(t).width + 8 * s;
    const lx = Math.min(Math.max(0, x), Math.max(0, W - w));
    let ly = Math.max(0, y - h);
    for (let tries = 0; tries < 8 && placed.some(([px0, py0, pw, ph]) => lx < px0 + pw && lx + w > px0 && ly < py0 + ph && ly + h > py0); tries++) {
      ly = ly - h >= 0 ? ly - h : Math.min(H - h, ly + h * (tries + 1));
    }
    placed.push([lx, ly, w, h]);
    ctx.fillStyle = bg;
    ctx.fillRect(lx, ly, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillText(t, lx + 4 * s, ly + h - 5 * s);
  };

  if (mode === "heatmap") {
    const gw = Math.max(8, Math.round(W / 4));
    const gh = Math.max(8, Math.round(H / 4));
    const field = attentionField(aois, gw, gh, H / W);
    const off = document.createElement("canvas");
    off.width = gw;
    off.height = gh;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(gw, gh);
    for (let i = 0; i < field.length; i++) {
      const [r, g, b, a] = heatColor(field[i]);
      img.data.set([r, g, b, a], i * 4);
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
    // Lo que casi no tiene calor se marca como «frío»: la ausencia de color no significa que no se analizó.
    for (const { aoi: a, level } of cold) {
      const [x, y, w, h] = px(a.box);
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeStyle = level === "blind" ? "#D55E00" : "#B26B00";
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      label(`Frío · ${a.label}`, x, y, level === "blind" ? "#D55E00" : "#B26B00");
    }
  }

  if (mode === "gaze") {
    const path = gazePath(aois);
    const pts = path.map((a) => {
      const [fx, fy] = focalPoint(a);
      return [fx * W, fy * H, (14 + 22 * a.attention) * s] as const;
    });
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = "rgba(0,114,178,0.85)";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    pts.forEach(([x, y, r], i) => {
      ctx.fillStyle = "rgba(0,114,178,0.55)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, y);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });
  }

  if (mode === "blind") {
    for (const { aoi: a, level } of cold) {
      const [x, y, w, h] = px(a.box);
      if (level === "blind") {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#D55E00";
        ctx.lineWidth = 3 * s;
        ctx.strokeRect(x, y, w, h);
        label(`Zona ciega · ${a.label}`, x, y, "#D55E00");
      } else {
        ctx.setLineDash([8 * s, 5 * s]);
        ctx.strokeStyle = "#B26B00";
        ctx.lineWidth = 3 * s;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        label(`Baja atención · ${a.label}`, x, y, "#B26B00");
      }
    }
  }

  if (mode === "boxes") {
    for (const a of aois) {
      const [x, y, w, h] = px(a.box);
      const isSel = a.id === selected;
      ctx.strokeStyle = isSel ? "#FFB000" : "rgba(20,17,12,0.9)";
      ctx.lineWidth = (isSel ? 4 : 2) * s;
      ctx.strokeRect(x, y, w, h);
      label(`${a.id} ${a.label}`, x, y, isSel ? "#B26B00" : "rgba(20,17,12,0.9)");
    }
    if (draft) {
      const [x, y, w, h] = px(draft);
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeStyle = "#FFB000";
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }
}

/** Texto bajo la imagen en «Zonas ciegas»: qué se marcó, o por qué no hay nada. */
function ColdZoneNotes({ cold, total }: { cold: ColdZone[]; total: number }) {
  const limit = Math.round(LOW_ATTENTION * 100);
  if (!total) return null;
  if (!cold.length) {
    return (
      <p role="status" className="text-sm text-muted">
        No se detectaron zonas ciegas: ningún elemento importante tiene atención estimada baja (≤ {limit} %). Si algo pasa desapercibido, ajústalo o agrégalo en «Áreas de interés».
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-sm">
      {cold.map(({ aoi, level }) => (
        <li key={aoi.id}>
          <span className={`font-medium ${level === "blind" ? "text-danger" : "text-accent-ink"}`}>{level === "blind" ? "Zona ciega" : "Baja atención"}</span> · {aoi.label} ·{" "}
          <span className="text-muted">
            importancia {aoi.importance}/5, atención {Math.round(aoi.attention * 100)} %
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Elementos importantes que la IA no incluyó en el recorrido visual. */
function OutsidePathNote({ aois }: { aois: Aoi[] }) {
  if (!aois.length) return null;
  return (
    <p className="text-sm text-muted">
      <span className="font-medium text-foreground">Fuera del recorrido:</span> {aois.map((a) => a.label).join(" · ")}. La IA no prevé que se miren; revísalo en «Áreas de interés».
    </p>
  );
}

function nextId(aois: Aoi[]): string {
  for (let i = aois.length + 1; ; i++) if (!aois.some((a) => a.id === `A${i}`)) return `A${i}`;
}

/**
 * Visor de atención. Las capas se dibujan en el navegador a partir de las AOI
 * (sin procesar la imagen en el servidor). En modo edición el analista corrige,
 * agrega (arrastrando sobre la imagen) o elimina áreas y las guarda.
 */
export function AttentionViewer({
  imageUrl,
  width,
  height,
  aois: initial,
  studyId,
  assetId,
  editable = false,
  initialMode = "heatmap",
  showControls = true,
  reviewed = false,
  maxHeight = "min(68vh, 640px)",
}: {
  imageUrl: string;
  width: number;
  height: number;
  aois: Aoi[];
  studyId?: string;
  assetId?: string;
  editable?: boolean;
  initialMode?: ViewMode;
  showControls?: boolean;
  reviewed?: boolean;
  maxHeight?: string;
}) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [aois, setAois] = useState<Aoi[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Aoi["box"] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<Aoi | null>(null);
  const [coordDrafts, setCoordDrafts] = useState<Partial<Record<number, string>>>({});
  const [coordError, setCoordError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setCoordDrafts({});
    setCoordError(null);
  }, [selected]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [saving, startSaving] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<[number, number] | null>(null);

  const scale = Math.min(1, MAX_CANVAS / width);
  const cw = Math.round(width * scale);
  const ch = Math.round(height * scale);

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

  const closeFullscreen = () => {
    setFullscreen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(() => previousFocusRef.current?.focus());
  };

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, mode, aois, selected, draft);
    const fctx = fullscreenCanvasRef.current?.getContext("2d");
    if (fctx) draw(fctx, mode, aois, selected, draft);
  }, [mode, aois, selected, draft, fullscreen]);

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

  const onPointerDownFullscreen = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);
  };

  const onPointerMoveFullscreen = (e: React.PointerEvent<HTMLDivElement>) => {
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

  const onPointerUpFullscreen = (e: React.PointerEvent<HTMLDivElement>) => {
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

  const onDoubleClickFullscreen = () => {
    if (zoom > 1) {
      handleResetZoom();
    } else {
      setZoom(2);
    }
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const update = useCallback((id: string, patch: Partial<Aoi>) => {
    setAois((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setDirty(true);
  }, []);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || mode !== "boxes") return;
    const p = pos(e);
    const hit = [...aois].reverse().find((a) => p[0] >= a.box[0] && p[0] <= a.box[2] && p[1] >= a.box[1] && p[1] <= a.box[3]);
    if (hit) {
      setSelected(hit.id);
      return;
    }
    start.current = p;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!start.current) return;
    const p = pos(e);
    const s = start.current;
    setDraft([Math.min(s[0], p[0]), Math.min(s[1], p[1]), Math.max(s[0], p[0]), Math.max(s[1], p[1])]);
  };
  const onUp = () => {
    const box = draft;
    start.current = null;
    setDraft(null);
    if (!box || box[2] - box[0] < 0.01 || box[3] - box[1] < 0.01) return;
    if (aois.length >= 30) {
      setMsg({ tone: "error", text: "Máximo 30 áreas de interés." });
      return;
    }
    const id = nextId(aois);
    setAois((xs) => [...xs, { id, label: "Nueva área", kind: "other", box, attention: 0.5, importance: 3, order: null }]);
    setSelected(id);
    setDirty(true);
  };

  const save = () =>
    startSaving(async () => {
      if (!studyId || !assetId) return;
      const res = await saveAois({ studyId, assetId, aois });
      if (res.error) setMsg({ tone: "error", text: res.error });
      else {
        setDirty(false);
        setMsg({ tone: "info", text: "Áreas de interés guardadas y marcadas como revisadas por el analista." });
      }
    });

  const exportPng = async () => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      await img.decode();
      const out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      const ctx = out.getContext("2d");
      if (!ctx || !canvasRef.current) return;
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.drawImage(canvasRef.current, 0, 0);
      const a = document.createElement("a");
      a.href = out.toDataURL("image/png");
      a.download = `${mode}-${assetId ?? "imagen"}.png`;
      a.click();
    } catch {
      setMsg({ tone: "error", text: "El navegador no permitió exportar la imagen. Usa una captura de pantalla." });
    }
  };

  const sel = useMemo(() => aois.find((a) => a.id === selected) ?? null, [aois, selected]);
  const cold = useMemo(() => coldZones(aois), [aois]);
  const unreached = useMemo(() => outsidePath(aois), [aois]);

  const ratio = width / height;

  return (
    <div className="space-y-3">
      {showControls ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-2xs print:hidden">
          <div className="flex items-center gap-2">
            <label htmlFor="viewer-mode-select" className="text-xs font-semibold text-muted">
              Capa:
            </label>
            <select
              id="viewer-mode-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as ViewMode)}
              aria-label="Capa sobre la imagen"
              className="min-h-11 rounded-md border border-control bg-surface-muted/50 px-2.5 pr-7 text-xs font-semibold text-heading shadow-2xs transition hover:border-primary/50 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink cursor-pointer"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.id === "blind" && cold.length ? ` (${cold.length})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFullscreen(true)}
              title="Ver a pantalla completa"
              aria-label="Pantalla completa"
            >
              <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
              <span>Pantalla completa</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={exportPng}
              title="Descargar imagen en PNG"
              aria-label="Descargar PNG"
            >
              <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>PNG</span>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div
          className="relative mx-auto overflow-hidden rounded-lg border border-border bg-foreground/5 break-inside-avoid shadow-xs"
          style={{
            aspectRatio: `${width} / ${height}`,
            maxHeight,
            maxWidth: `min(100%, calc(${maxHeight} * ${ratio}))`,
            width: "100%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage; next/image no aplica */}
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
          <canvas
            ref={canvasRef}
            width={cw}
            height={ch}
            className={`absolute inset-0 h-full w-full ${editable && mode === "boxes" ? "cursor-crosshair touch-none" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            aria-label="Capa de análisis sobre la imagen"
          />
        </div>

        {editable && mode === "boxes" ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="text-xs text-muted">Arrastra sobre la imagen para agregar un área (o usa «Agregar área»); haz clic en una para editarla.</p>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-medium text-heading underline underline-offset-4"
              onClick={() => {
                if (aois.length >= 30) return setMsg({ tone: "error", text: "Máximo 30 áreas de interés." });
                const id = nextId(aois);
                setAois((xs) => [...xs, { id, label: "Nueva área", kind: "other", box: [0.35, 0.35, 0.65, 0.65], attention: 0.5, importance: 3, order: null }]);
                setSelected(id);
                setDirty(true);
              }}
            >
              + Agregar área
            </button>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {aois.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a.id)}
                    className={`min-h-10 w-full rounded px-2.5 py-1.5 text-left ${a.id === selected ? "bg-primary/10 font-medium" : "hover:bg-foreground/5"}`}
                  >
                    {a.id} · {a.label}
                  </button>
                </li>
              ))}
            </ul>
            {lastDeleted ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-xs">
                <span className="text-heading">Área «{lastDeleted.label}» eliminada.</span>
                <button
                  type="button"
                  className="min-h-11 font-semibold text-accent-ink underline underline-offset-4 hover:text-heading"
                  onClick={() => {
                    setAois((xs) => [...xs, lastDeleted]);
                    setSelected(lastDeleted.id);
                    setLastDeleted(null);
                    setDirty(true);
                  }}
                >
                  Deshacer
                </button>
              </div>
            ) : null}
            {sel ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Etiqueta</span>
                  <input value={sel.label} maxLength={80} onChange={(e) => update(sel.id, { label: e.target.value })} className="min-h-11 w-full rounded border border-control bg-background px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Tipo</span>
                  <select value={sel.kind} onChange={(e) => update(sel.id, { kind: e.target.value as AoiKind })} className="min-h-11 w-full rounded border border-control bg-background px-2.5 py-1.5 text-sm">
                    {AOI_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {AOI_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Atracción visual: {Math.round(sel.attention * 100)} %</span>
                  <input type="range" min={0} max={1} step={0.05} value={sel.attention} onChange={(e) => update(sel.id, { attention: Number(e.target.value) })} className="w-full" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Importancia</span>
                    <select value={sel.importance} onChange={(e) => update(sel.id, { importance: Number(e.target.value) })} className="min-h-11 w-full rounded border border-control bg-background px-2.5 py-1.5 text-sm">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Orden de lectura</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={sel.order ?? ""}
                      placeholder="sin dato"
                      onChange={(e) => update(sel.id, { order: e.target.value ? Math.max(1, Math.min(50, Number(e.target.value))) : null })}
                      className="min-h-11 w-full rounded border border-control bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium">Posición y tamaño (% de la imagen)</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(["Izquierda", "Arriba", "Derecha", "Abajo"] as const).map((name, i) => (
                      <label key={name} className="flex items-center gap-1 text-xs">
                        <span className="w-16">{name}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={coordDrafts[i] ?? String(Math.round(sel.box[i] * 100))}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setCoordError(null);
                            setCoordDrafts((prev) => ({ ...prev, [i]: raw }));
                            if (raw === "") return;
                            const parsed = Number(raw);
                            if (!Number.isFinite(parsed)) return;
                            const v = Math.min(100, Math.max(0, parsed)) / 100;
                            const box = [...sel.box] as Aoi["box"];
                            box[i] = v;
                            if (box[2] - box[0] >= 0.01 && box[3] - box[1] >= 0.01) {
                              update(sel.id, { box });
                            }
                          }}
                          onBlur={() => {
                            const raw = coordDrafts[i];
                            setCoordDrafts((prev) => {
                              const next = { ...prev };
                              delete next[i];
                              return next;
                            });
                            if (raw === undefined || raw === "") return;
                            const parsed = Number(raw);
                            if (!Number.isFinite(parsed)) return;
                            const v = Math.min(100, Math.max(0, parsed)) / 100;
                            const box = [...sel.box] as Aoi["box"];
                            box[i] = v;
                            if (box[2] - box[0] >= 0.01 && box[3] - box[1] >= 0.01) {
                              update(sel.id, { box });
                            } else {
                              setCoordError("El borde no puede cruzar el lado opuesto (mínimo 1 %).");
                            }
                          }}
                          className="min-h-11 w-full rounded border border-control bg-background px-2.5 py-1.5 text-sm tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                  {coordError ? <p className="text-xs text-danger" role="alert">{coordError}</p> : null}
                </fieldset>
                <button
                  type="button"
                  className="min-h-11 text-xs font-medium text-danger hover:underline"
                  onClick={() => {
                    setLastDeleted(sel);
                    setAois((xs) => xs.filter((x) => x.id !== sel.id));
                    setSelected(null);
                    setDirty(true);
                  }}
                >
                  Eliminar área
                </button>
              </div>
            ) : null}
            {dirty ? (
              <p className="text-xs text-accent-ink" role="status">
                Tienes cambios sin guardar en las áreas de interés.
              </p>
            ) : null}
            <Button type="button" variant={dirty ? "primary" : "secondary"} onClick={save} disabled={saving || !dirty} className="w-full">
              {saving ? "Guardando…" : dirty ? "Guardar áreas revisadas" : reviewed ? "Revisadas por el analista" : "Sin cambios"}
            </Button>
          </div>
        ) : null}
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {mode === "blind" ? <ColdZoneNotes cold={cold} total={aois.length} /> : null}
      {mode === "gaze" ? <OutsidePathNote aois={unreached} /> : null}
      {showControls && (mode === "heatmap" || mode === "gaze" || mode === "blind") ? (
        <p className="text-xs text-muted">
          Estimación experta (IA + revisión del analista) a partir de principios de saliencia visual. No es eye tracking ni datos de personas reales.
        </p>
      ) : null}

      {fullscreen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Visor a pantalla completa"
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
            <div className="flex flex-wrap items-center gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition motion-reduce:transition-none ${
                    mode === m.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/30 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {m.label}
                  {m.id === "blind" && cold.length ? ` (${cold.length})` : ""}
                </button>
              ))}
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
                  className="min-h-11 min-w-12 px-1 text-center text-xs font-semibold tabular-nums text-white/90 transition hover:text-white"
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
                onClick={exportPng}
                className="inline-flex min-h-11 items-center px-2 text-xs text-white/80 underline underline-offset-4 hover:text-white"
              >
                Descargar PNG
              </button>
              <button
                type="button"
                onClick={closeFullscreen}
                className="inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-xs font-semibold text-white hover:bg-white/25"
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
              onPointerDown={onPointerDownFullscreen}
              onPointerMove={onPointerMoveFullscreen}
              onPointerUp={onPointerUpFullscreen}
              onPointerCancel={onPointerUpFullscreen}
              onDoubleClick={onDoubleClickFullscreen}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full pointer-events-none select-none" draggable={false} />
              <canvas
                ref={fullscreenCanvasRef}
                width={cw}
                height={ch}
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              />
            </div>

            {zoom > 1 ? (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-deep/90 px-3 py-1.5 text-2xs text-white/90 shadow-lg">
                Arrastra para explorar · Doble clic para restablecer (0)
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
