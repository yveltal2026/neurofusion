"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  AOI_KINDS,
  AOI_KIND_LABEL,
  type Aoi,
  type AoiKind,
} from "@/tools/visual/engine/aoi";
import { saveEyeAois } from "../aoi-actions";

export function EyeAoiEditor({
  studyId,
  assetId,
  imageUrl,
  width,
  height,
  initial,
}: {
  studyId: string;
  assetId: string;
  imageUrl: string;
  width: number;
  height: number;
  initial: Aoi[];
}) {
  const [saved, setSaved] = useState(initial);
  const [aois, setAois] = useState(initial);
  const [selected, setSelected] = useState<string | null>(
    initial[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<Aoi["box"] | null>(null);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const start = useRef<[number, number] | null>(null);
  const router = useRouter();
  const active = aois.find((a) => a.id === selected);
  function add(box: Aoi["box"]) {
    if (saving) return;
    if (aois.length >= 30) {
      setMessage("Máximo 30 áreas.");
      return;
    }
    let n = 1;
    while (aois.some((a) => a.id === `A${n}`)) n++;
    const id = `A${n}`;
    setAois([
      ...aois,
      {
        id,
        label: `Área ${n}`,
        kind: "other",
        box,
        attention: 0,
        importance: 3,
        order: null,
      },
    ]);
    setSelected(id);
    setDirty(true);
    setMessage("");
  }
  function update(patch: Partial<Aoi>) {
    setAois(aois.map((a) => (a.id === selected ? { ...a, ...patch } : a)));
    setDirty(true);
    setMessage("");
  }
  function position(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    ];
  }
  return (
    <section
      className="space-y-3"
      aria-label="Editor de áreas de interés"
      aria-busy={saving}
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <legend className="sr-only">Editar y guardar áreas de interés</legend>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="glass-panel min-w-0 space-y-3 rounded-panel p-4">
            <p className="text-sm text-muted">
              Dibuja un rectángulo para delimitar un logotipo, precio, producto
              o CTA. También puedes agregar un área y ajustar sus límites en
              porcentaje. Al guardar se recalculan los KPIs con estas áreas; las
              lecturas originales se conservan.
            </p>
            <div
              className="relative overflow-hidden rounded-lg border border-border"
              style={{ aspectRatio: `${width}/${height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed image */}
              <img
                src={imageUrl}
                alt="Imagen del estudio para delimitar áreas"
                className="absolute inset-0 size-full"
                draggable={false}
              />
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="absolute inset-0 size-full touch-none cursor-crosshair"
                aria-label="Dibujar áreas sobre la imagen"
                onPointerDown={(e) => {
                  if (saving) return;
                  start.current = position(e);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!start.current) return;
                  const p = position(e),
                    s = start.current;
                  setDraft([
                    Math.min(s[0], p[0]),
                    Math.min(s[1], p[1]),
                    Math.max(s[0], p[0]),
                    Math.max(s[1], p[1]),
                  ]);
                }}
                onPointerUp={() => {
                  if (
                    draft &&
                    draft[2] - draft[0] >= 0.01 &&
                    draft[3] - draft[1] >= 0.01
                  )
                    add(draft);
                  start.current = null;
                  setDraft(null);
                }}
                onPointerCancel={() => {
                  start.current = null;
                  setDraft(null);
                }}
              >
                {aois.map((a) => (
                  <g
                    key={a.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected(a.id);
                    }}
                  >
                    <rect
                      x={a.box[0] * width}
                      y={a.box[1] * height}
                      width={Math.max(0, a.box[2] - a.box[0]) * width}
                      height={Math.max(0, a.box[3] - a.box[1]) * height}
                      fill={a.id === selected ? "#ffb00033" : "#00000011"}
                      stroke={a.id === selected ? "#ffb000" : "#14110c"}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={a.box[0] * width + 4}
                      y={a.box[1] * height + width * 0.023}
                      fontSize={width * 0.02}
                      fill="white"
                      stroke="black"
                      strokeWidth={width * 0.002}
                      paintOrder="stroke"
                    >
                      {a.id} · {a.label}
                    </text>
                  </g>
                ))}
                {draft ? (
                  <rect
                    x={draft[0] * width}
                    y={draft[1] * height}
                    width={(draft[2] - draft[0]) * width}
                    height={(draft[3] - draft[1]) * height}
                    fill="#ffb00033"
                    stroke="#ffb000"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
            </div>
          </div>
          <div className="glass-panel min-w-0 space-y-3 rounded-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold" aria-live="polite">
                {aois.length} {aois.length === 1 ? "área" : "áreas"}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => add([0.25, 0.25, 0.75, 0.75])}
                disabled={saving}
              >
                Agregar área
              </Button>
            </div>
            <div className="grid gap-2">
              {aois.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  aria-pressed={a.id === selected}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface/80 px-3 py-2 text-left text-sm aria-pressed:border-primary aria-pressed:bg-neuro-tint"
                  onClick={() => setSelected(a.id)}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-heading text-xs font-bold text-background">
                    {a.id}
                  </span>
                  <span className="min-w-0 break-words font-semibold">
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
            {active ? (
              <div className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
                <label>
                  Etiqueta
                  <Input
                    value={active.label}
                    maxLength={80}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    className="block min-h-11 w-full rounded-md border border-control bg-surface px-2"
                    value={active.kind}
                    onChange={(e) =>
                      update({ kind: e.target.value as AoiKind })
                    }
                  >
                    {AOI_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {AOI_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                {(["Izquierda", "Arriba", "Derecha", "Abajo"] as const).map(
                  (label, i) => (
                    <label key={label}>
                      {label} (%)
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={Number((active.box[i] * 100).toFixed(1))}
                        onChange={(e) => {
                          const box = [...active.box] as Aoi["box"];
                          box[i] = Number(e.target.value) / 100;
                          update({ box });
                        }}
                      />
                    </label>
                  ),
                )}
                <button
                  type="button"
                  className="min-h-11 text-left text-danger underline"
                  onClick={() => {
                    setAois(aois.filter((a) => a.id !== selected));
                    setSelected(null);
                    setDirty(true);
                    setMessage("");
                  }}
                >
                  Eliminar área
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {dirty ? (
          <p className="text-sm text-muted">Cambios sin guardar.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty}
            onClick={() => {
              setAois(saved);
              setSelected(saved[0]?.id ?? null);
              setDirty(false);
              setMessage("");
            }}
          >
            Descartar cambios
          </Button>
          <Button
            type="button"
            disabled={saving || !dirty}
            onClick={() =>
              startSaving(async () => {
                start.current = null;
                setDraft(null);
                setMessage("");
                try {
                  const result = await saveEyeAois({ studyId, assetId, aois });
                  setMessage(
                    result.error ??
                      "Áreas guardadas. Los resultados ya usan esta definición.",
                  );
                  if (result.ok) {
                    setSaved(aois);
                    setDirty(false);
                    router.refresh();
                  }
                } catch {
                  setMessage(
                    "No se pudieron guardar las áreas. Inténtalo de nuevo.",
                  );
                }
              })
            }
          >
            {saving ? "Guardando…" : "Guardar áreas"}
          </Button>
        </div>
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
      </fieldset>
    </section>
  );
}
