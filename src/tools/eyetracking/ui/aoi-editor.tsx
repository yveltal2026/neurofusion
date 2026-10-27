"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      <fieldset disabled={saving} className="space-y-3">
        <legend className="sr-only">Editar y guardar áreas de interés</legend>
        <h3 className="font-medium">Áreas de interés (AOI)</h3>
        <p className="text-sm text-muted">
          Dibuja un rectángulo para delimitar un logotipo, precio, producto o
          CTA. También puedes agregar un área y ajustar sus límites en
          porcentaje. Al guardar se recalculan los KPIs con estas áreas; las
          lecturas originales se conservan.
        </p>
        <div
          className="relative overflow-hidden rounded border border-border"
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
                  fill={a.id === selected ? "#06b6d433" : "#00000011"}
                  stroke={a.id === selected ? "#06b6d4" : "#ffffff"}
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
                fill="#06b6d433"
                stroke="#06b6d4"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="underline"
            onClick={() => add([0.25, 0.25, 0.75, 0.75])}
            disabled={saving}
          >
            Agregar área
          </button>
          {aois.map((a) => (
            <button
              type="button"
              key={a.id}
              aria-pressed={a.id === selected}
              className="rounded border border-border px-2 py-1 text-sm"
              onClick={() => setSelected(a.id)}
            >
              {a.id} · {a.label}
            </button>
          ))}
        </div>
        {active ? (
          <div className="grid gap-3 rounded border border-border p-3 sm:grid-cols-2">
            <label>
              Etiqueta
              <input
                className="block w-full rounded border border-border bg-background p-2"
                value={active.label}
                maxLength={80}
                onChange={(e) => update({ label: e.target.value })}
              />
            </label>
            <label>
              Tipo
              <select
                className="block w-full rounded border border-border bg-background p-2"
                value={active.kind}
                onChange={(e) => update({ kind: e.target.value as AoiKind })}
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
                  <input
                    className="block w-full rounded border border-border bg-background p-2"
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
              className="text-danger underline"
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
        {dirty ? (
          <p className="text-sm text-muted">Cambios sin guardar.</p>
        ) : null}
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
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
      </fieldset>
    </section>
  );
}
