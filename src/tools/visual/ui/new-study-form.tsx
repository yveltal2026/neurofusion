"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createVisualStudy } from "../actions";
import { siteKey, type JourneySite, type JourneyTask } from "../config";
import { AGE_GROUPS, DEFAULT_CALIBRATION, DEFAULT_QUOTAS, LITERACY, type Quotas } from "../journey/calibration";
import { TASK_KIND_DEFS, TASK_KINDS, type TaskKind } from "../journey/model";

const DEFAULT_TASKS: JourneyTask[] = [
  { id: "T1", name: "Búsqueda", instruction: "Busca el producto objetivo con el buscador del sitio.", kind: "busqueda" },
  { id: "T2", name: "Resultados", instruction: "Elige el producto adecuado en la lista de resultados.", kind: "resultados" },
  { id: "T3", name: "Ficha de producto", instruction: "Encuentra precio, envío, disponibilidad y meses sin intereses.", kind: "ficha" },
  { id: "T4", name: "Carrito", instruction: "Agrega el producto al carrito y llega al pago.", kind: "carrito" },
  { id: "T5", name: "Categorías", instruction: "Llega al mismo producto navegando por el menú de categorías.", kind: "categorias" },
];

const select = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export function NewVisualStudyForm({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<"pieces" | "journey" | "eyetracking">("pieces");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [brand, setBrand] = useState("");
  const [audience, setAudience] = useState("");
  const [productTarget, setProductTarget] = useState("");
  const [sites, setSites] = useState<Omit<JourneySite, "key">[]>([{ name: "", url: "", competitor: false }]);
  const [tasks, setTasks] = useState<JourneyTask[]>(DEFAULT_TASKS);
  const [quotas, setQuotas] = useState<Quotas>(DEFAULT_QUOTAS);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const quotasEdited = JSON.stringify(quotas) !== JSON.stringify(DEFAULT_QUOTAS);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const keys: string[] = [];
    const config =
      mode !== "journey"
        ? { mode: "pieces", objective, brand, audience, ...(mode === "eyetracking" ? { eyeTracking: { durationSeconds: 10 } } : {}) }
        : {
            mode,
            objective,
            brand,
            audience,
            productTarget,
            sites: sites.map((s) => {
              const key = siteKey(s.name, keys);
              keys.push(key);
              return { ...s, key };
            }),
            tasks,
            panel: { calibration: quotasEdited ? "personalizada" : DEFAULT_CALIBRATION, quotas },
          };
    start(async () => {
      const res = await createVisualStudy({ projectId, name, config });
      if (res?.error) setError(res.error);
    });
  };

  const setSite = (i: number, patch: Partial<JourneySite>) => setSites((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setTask = (i: number, patch: Partial<JourneyTask>) => setTasks((xs) => xs.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const nextTaskId = () => {
    for (let i = 1; ; i++) if (!tasks.some((t) => t.id === `T${i}`)) return `T${i}`;
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Nombre del estudio">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} placeholder="Campaña Buen Fin · piezas Meta" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Qué vas a analizar?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["pieces", "Piezas gráficas", "Anuncios, banners, posts, empaques o capturas sueltas. Compara variantes."],
              ["eyetracking", "Piezas con eye tracking", "Participantes miran hasta 5 imágenes con webcam. Guarda la mirada y muestra mapas de atención reales."],
              ["journey", "Journey web + IFD", "Capturas del recorrido de compra de uno o varios sitios, calificación con rúbrica e Índice de Fricción Digital."],
            ] as const
          ).map(([value, title, desc]) => (
            <label key={value} className={`cursor-pointer rounded-lg border p-4 ${mode === value ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
              <span className="font-medium">{title}</span>
              <span className="mt-1 block text-sm text-muted">{desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Objetivo" hint="Qué debe lograr el material o el sitio. La IA evalúa contra esto.">
        <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} required maxLength={600} placeholder="Que el usuario identifique la promoción de 12 MSI y haga clic en «Comprar»." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marca (opcional)">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Público objetivo (opcional)">
          <Input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={400} placeholder="Mujeres 25–44, CDMX y GDL, compra desde celular" />
        </Field>
      </div>

      {mode === "journey" ? (
        <>
          <Field label="Producto objetivo del recorrido (opcional)">
            <Input value={productTarget} onChange={(e) => setProductTarget(e.target.value)} maxLength={160} placeholder="Licuadora de 10 velocidades" />
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Sitios</legend>
            {sites.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center">
                <Input value={s.name} onChange={(e) => setSite(i, { name: e.target.value })} placeholder={i === 0 ? "Sitio principal" : "Competidor"} required maxLength={80} aria-label={`Nombre del sitio ${i + 1}`} />
                <Input value={s.url} onChange={(e) => setSite(i, { url: e.target.value })} placeholder="https://www.sitio.com.mx" type="url" required aria-label={`URL del sitio ${i + 1}`} />
                {i === 0 ? (
                  <span className="text-xs text-muted">Principal</span>
                ) : (
                  <button type="button" className="text-sm text-danger hover:underline" onClick={() => setSites((xs) => xs.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
            {sites.length < 6 ? (
              <button type="button" className="text-sm font-medium text-heading underline underline-offset-4" onClick={() => setSites((xs) => [...xs, { name: "", url: "", competitor: true }])}>
                + Agregar competidor
              </button>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Tareas del recorrido</legend>
            {tasks.map((t, i) => (
              <div key={t.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[60px_1fr_180px_auto]">
                <span className="pt-2 text-sm font-medium">{t.id}</span>
                <div className="space-y-2">
                  <Input value={t.name} onChange={(e) => setTask(i, { name: e.target.value })} required maxLength={80} aria-label={`Nombre de ${t.id}`} />
                  <Input value={t.instruction} onChange={(e) => setTask(i, { instruction: e.target.value })} required maxLength={400} aria-label={`Instrucción de ${t.id}`} />
                </div>
                <select value={t.kind} onChange={(e) => setTask(i, { kind: e.target.value as TaskKind })} className={select} aria-label={`Tipo de ${t.id}`}>
                  {TASK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {TASK_KIND_DEFS[k].label}
                    </option>
                  ))}
                </select>
                {tasks.length > 1 ? (
                  <button type="button" className="text-sm text-danger hover:underline" onClick={() => setTasks((xs) => xs.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                ) : null}
              </div>
            ))}
            {tasks.length < 8 ? (
              <button
                type="button"
                className="text-sm font-medium text-heading underline underline-offset-4"
                onClick={() => setTasks((xs) => [...xs, { id: nextTaskId(), name: "", instruction: "", kind: "otra" }])}
              >
                + Agregar tarea
              </button>
            ) : null}
            <p className="text-xs text-muted">El tipo de tarea define qué fricciones influyen en su éxito dentro del modelo.</p>
          </fieldset>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Panel modelado (avanzado)</summary>
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted">
                Cuotas en % (calibración {DEFAULT_CALIBRATION}, consumidor digital mexicano). Sólo la edad y la alfabetización digital influyen en el modelo.
              </p>
              {(
                [
                  ["age", AGE_GROUPS, "Edad"],
                  ["literacy", LITERACY, "Alfabetización digital"],
                ] as const
              ).map(([dim, groups, label]) => (
                <div key={dim}>
                  <p className="font-medium">
                    {label} · suma {sum(quotas[dim]).toFixed(2)} %
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {groups.map((g) => (
                      <label key={g} className="flex items-center gap-1">
                        {g}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={(quotas[dim] as Record<string, number>)[g]}
                          onChange={(e) => setQuotas((q) => ({ ...q, [dim]: { ...q[dim], [g]: Number(e.target.value) } }))}
                          className="w-20 rounded border border-border bg-background px-2 py-1 tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear estudio"}
      </Button>
    </form>
  );
}
