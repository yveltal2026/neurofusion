"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveAois } from "../actions";
import { AOI_KIND_LABEL, AOI_KINDS, attentionField, blindZones, gazePath, heatColor, type Aoi, type AoiKind } from "../engine/aoi";

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
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const s = W / 800;
  const px = (b: Aoi["box"]) => [b[0] * W, b[1] * H, (b[2] - b[0]) * W, (b[3] - b[1]) * H] as const;
  const label = (text: string, x: number, y: number, bg: string) => {
    ctx.font = `600 ${Math.round(13 * s)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 8 * s;
    const h = 18 * s;
    ctx.fillStyle = bg;
    ctx.fillRect(x, Math.max(0, y - h), w, h);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + 4 * s, Math.max(h, y) - 5 * s);
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
  }

  if (mode === "gaze") {
    const path = gazePath(aois);
    const pts = path.map((a) => [((a.box[0] + a.box[2]) / 2) * W, ((a.box[1] + a.box[3]) / 2) * H, (14 + 22 * a.attention) * s] as const);
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
    for (const a of blindZones(aois)) {
      const [x, y, w, h] = px(a.box);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#D55E00";
      ctx.lineWidth = 3 * s;
      ctx.strokeRect(x, y, w, h);
      label(`Zona ciega · ${a.label}`, x, y, "#D55E00");
    }
  }

  if (mode === "boxes") {
    for (const a of aois) {
      const [x, y, w, h] = px(a.box);
      const isSel = a.id === selected;
      ctx.strokeStyle = isSel ? "#E69F00" : "rgba(0,114,178,0.9)";
      ctx.lineWidth = (isSel ? 4 : 2) * s;
      ctx.strokeRect(x, y, w, h);
      label(`${a.id} ${a.label}`, x, y, isSel ? "#B26B00" : "rgba(0,90,140,0.9)");
    }
    if (draft) {
      const [x, y, w, h] = px(draft);
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeStyle = "#E69F00";
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }
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
}) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [aois, setAois] = useState<Aoi[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Aoi["box"] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<[number, number] | null>(null);

  const scale = Math.min(1, MAX_CANVAS / width);
  const cw = Math.round(width * scale);
  const ch = Math.round(height * scale);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, mode, aois, selected, draft);
  }, [mode, aois, selected, draft]);

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
  const blind = blindZones(aois).length;

  return (
    <div className="space-y-3">
      {showControls ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Capa">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full border px-3 py-1 text-sm ${mode === m.id ? "border-primary bg-primary/10 font-medium" : "border-border text-muted hover:text-foreground"}`}
            >
              {m.label}
              {m.id === "blind" && blind ? ` (${blind})` : ""}
            </button>
          ))}
          <button type="button" onClick={exportPng} className="ml-auto text-sm text-heading underline underline-offset-4">
            Descargar PNG
          </button>
        </div>
      ) : null}

      <div className={editable && mode === "boxes" ? "grid gap-4 lg:grid-cols-[1fr_300px]" : ""}>
        <div className="relative w-full overflow-hidden rounded-lg border border-border bg-foreground/5 break-inside-avoid" style={{ aspectRatio: `${width} / ${height}` }}>
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
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted">Arrastra sobre la imagen para agregar un área; haz clic en una para editarla.</p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {aois.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a.id)}
                    className={`w-full rounded px-2 py-1 text-left ${a.id === selected ? "bg-primary/10 font-medium" : "hover:bg-foreground/5"}`}
                  >
                    {a.id} · {a.label}
                  </button>
                </li>
              ))}
            </ul>
            {sel ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Etiqueta</span>
                  <input value={sel.label} maxLength={80} onChange={(e) => update(sel.id, { label: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Tipo</span>
                  <select value={sel.kind} onChange={(e) => update(sel.id, { kind: e.target.value as AoiKind })} className="w-full rounded border border-border bg-background px-2 py-1">
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
                    <select value={sel.importance} onChange={(e) => update(sel.id, { importance: Number(e.target.value) })} className="w-full rounded border border-border bg-background px-2 py-1">
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
                      placeholder="—"
                      onChange={(e) => update(sel.id, { order: e.target.value ? Math.max(1, Math.min(50, Number(e.target.value))) : null })}
                      className="w-full rounded border border-border bg-background px-2 py-1"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() => {
                    setAois((xs) => xs.filter((x) => x.id !== sel.id));
                    setSelected(null);
                    setDirty(true);
                  }}
                >
                  Eliminar área
                </button>
              </div>
            ) : null}
            <Button type="button" onClick={save} disabled={saving || !dirty} className="w-full">
              {saving ? "Guardando…" : dirty ? "Guardar áreas revisadas" : reviewed ? "Revisadas por el analista" : "Sin cambios"}
            </Button>
          </div>
        ) : null}
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {mode === "heatmap" || mode === "gaze" || mode === "blind" ? (
        <p className="text-xs text-muted">
          Estimación experta (IA + revisión del analista) a partir de principios de saliencia visual. No es eye tracking ni datos de personas reales.
        </p>
      ) : null}
    </div>
  );
}
