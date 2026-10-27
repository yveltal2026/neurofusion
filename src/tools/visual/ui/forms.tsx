"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { analyzeAsset, runIfd, saveRating, suggestRatings, updateAssetMeta, updateVisualContext, type VisualFormState } from "../actions";
import type { VisualConfig } from "../config";
import { PLACEMENTS } from "../engine/placements";
import type { RubricItem } from "../journey/rubric";

const initial: VisualFormState = {};
const select = "w-full rounded-md border border-control bg-background px-3 py-2 text-sm";

function State({ state, okText }: { state: VisualFormState; okText?: string }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok && (state.message || okText)) return <Alert>{state.message ?? okText}</Alert>;
  return null;
}

export function AnalyzeAssetForm({ studyId, assetId, hasAnalysis }: { studyId: string; assetId: string; hasAnalysis: boolean }) {
  const [state, action, pending] = useActionState(analyzeAsset, initial);
  return (
    <form action={action} className="space-y-3 print:hidden">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="assetId" value={assetId} />
      <State state={state} />
      <Button type="submit" variant={hasAnalysis ? "secondary" : "primary"} disabled={pending}>
        {pending ? "Analizando la imagen… (puede tardar un minuto)" : hasAnalysis ? "Volver a analizar con IA" : "Analizar con IA"}
      </Button>
    </form>
  );
}

export function AssetMetaForm({ studyId, assetId, title, placement, withPlacement = true }: { studyId: string; assetId: string; title: string; placement: string | null; withPlacement?: boolean }) {
  const [state, action, pending] = useActionState(updateAssetMeta, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="assetId" value={assetId} />
      <Field label="Título">
        <Input name="title" defaultValue={title} maxLength={160} required />
      </Field>
      {withPlacement ? <Field label="Formato / colocación" hint="Activa la revisión de tamaño, proporción y peso.">
        <select name="placement" defaultValue={placement ?? ""} className={select}>
          <option value="">Sin especificar</option>
          {PLACEMENTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field> : null}
      <State state={state} okText="Guardado." />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export function VisualContextForm({ studyId, config }: { studyId: string; config: VisualConfig }) {
  const [state, action, pending] = useActionState(updateVisualContext, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="studyId" value={studyId} />
      <Field label="Objetivo" hint={config.mode === "pieces" && config.eyeTracking ? "Qué quieres investigar sobre la atención de tus participantes." : "La IA evalúa cada pieza contra este objetivo."}>
        <Textarea name="objective" defaultValue={config.objective} required maxLength={600} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marca">
          <Input name="brand" defaultValue={config.brand} maxLength={120} />
        </Field>
        <Field label="Público objetivo">
          <Input name="audience" defaultValue={config.audience} maxLength={400} />
        </Field>
      </div>
      {config.mode === "journey" ? (
        <>
          <Field label="Producto objetivo del recorrido">
            <Input name="productTarget" defaultValue={config.productTarget} maxLength={160} />
          </Field>
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Agregar competidor</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="newSiteName" placeholder="Nombre" maxLength={80} />
              <Input name="newSiteUrl" type="url" placeholder="https://competidor.com.mx" />
            </div>
            <p className="text-xs text-muted">Las tareas y la calibración del panel no se editan después de crear el estudio (para que las mediciones sean comparables).</p>
          </fieldset>
        </>
      ) : null}
      <State state={state} okText="Cambios guardados." />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export interface EvidenceOption {
  id: string;
  label: string;
}

export interface Suggestion {
  value: number;
  justification: string;
  evidenceAssetId: string | null;
  confidence: "low" | "medium" | "high";
}

const CONF = { low: "baja", medium: "media", high: "alta" } as const;

/** Calificación de un ítem de la rúbrica con su evidencia. */
export function RatingItemForm({
  studyId,
  siteKey,
  item,
  current,
  evidence,
  suggestion,
}: {
  studyId: string;
  siteKey: string;
  item: RubricItem;
  current: { value: number; justification: string; evidenceAssetId: string | null; source: string } | null;
  evidence: EvidenceOption[];
  suggestion: Suggestion | null;
}) {
  const [state, action, pending] = useActionState(saveRating, initial);
  const [value, setValue] = useState<number>(current?.value ?? (item.kind === "base" ? 0.6 : item.kind === "boolean" ? 0 : 0.5));
  const [justification, setJustification] = useState(current?.justification ?? "");
  const [ev, setEv] = useState(current?.evidenceAssetId ?? "");
  const [source, setSource] = useState(current?.source ?? "analyst");
  const min = item.kind === "base" ? 0.04 : 0;
  const max = item.kind === "base" ? 0.97 : 1;
  const nearest = item.anchors.reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a), item.anchors[0]);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border p-4 break-inside-avoid">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="siteKey" value={siteKey} />
      <input type="hidden" name="itemKey" value={item.key} />
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{item.label}</h3>
          <p className="text-sm text-muted">{item.question}</p>
          <p className="text-xs text-muted">Afecta: {item.affects}</p>
        </div>
        {current ? (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Calificado{current.source === "ai_assisted" ? " · con IA" : ""}</span>
        ) : (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs">Pendiente</span>
        )}
      </div>

      {item.kind === "boolean" ? (
        <div className="flex flex-wrap gap-4 text-sm">
          {item.anchors.map((a) => (
            <label key={a.value} className="flex items-center gap-2">
              <input type="radio" name="value" value={a.value} checked={value === a.value} onChange={() => setValue(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-6 flex-1" aria-label={item.label} />
            <input name="value" type="number" aria-label={`${item.label}: valor numérico`} min={min} max={max} step={0.01} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-20 rounded border border-control bg-background px-2 py-1 text-sm tabular-nums" />
          </div>
          <p className="text-xs text-muted">Ancla más cercana: {nearest.value} · {nearest.label}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Justificación con evidencia</span>
          <textarea
            name="justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            required
            minLength={10}
            maxLength={2000}
            placeholder="Qué observaste y dónde (p. ej. «la ficha no muestra costo de envío hasta el checkout, captura T4-2»)."
            className="min-h-20 w-full rounded-md border border-control bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Captura de evidencia</span>
          <select name="evidenceAssetId" value={ev} onChange={(e) => setEv(e.target.value)} className={select}>
            <option value="">Sin captura</option>
            {evidence.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {suggestion ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm print:hidden">
          <p>
            <strong>Sugerencia de IA:</strong> {suggestion.value} (confianza {CONF[suggestion.confidence]}). {suggestion.justification}
          </p>
          <button
            type="button"
            className="mt-1 py-1 text-sm font-medium text-heading underline underline-offset-4"
            onClick={() => {
              setValue(suggestion.value);
              setJustification(suggestion.justification);
              setEv(suggestion.evidenceAssetId ?? "");
              setSource("ai_assisted");
            }}
          >
            Usar como punto de partida (revísala antes de guardar)
          </button>
        </div>
      ) : null}

      <State state={state} okText="Calificación guardada." />
      <Button type="submit" variant="secondary" disabled={pending} className="print:hidden">
        {pending ? "Guardando…" : current ? "Actualizar" : "Guardar calificación"}
      </Button>
    </form>
  );
}

export function SuggestRatingsForm({ studyId, siteKey, disabled }: { studyId: string; siteKey: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(suggestRatings, initial);
  return (
    <form action={action} className="space-y-2 print:hidden">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="siteKey" value={siteKey} />
      <State state={state} />
      <Button type="submit" variant="secondary" disabled={pending || disabled}>
        {pending ? "La IA está revisando las capturas…" : "Pedir sugerencias a la IA"}
      </Button>
    </form>
  );
}

export function RunIfdForm({ studyId, ready }: { studyId: string; ready: boolean }) {
  const [state, action, pending] = useActionState(runIfd, initial);
  return (
    <form action={action} className="space-y-2 print:hidden">
      <input type="hidden" name="studyId" value={studyId} />
      <State state={state} okText="Medición guardada." />
      <Button type="submit" disabled={pending || !ready}>
        {pending ? "Calculando…" : "Calcular IFD"}
      </Button>
    </form>
  );
}
