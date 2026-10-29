"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { runResearchAnalysis } from "./actions";
import type { ResearchContext } from "./schema";

const fields = [
  [
    "material",
    "¿Qué material se analizó?",
    "Describe las piezas, producto, campaña o experiencia evaluada.",
    true,
  ],
  [
    "materialObjective",
    "¿Cuál es el objetivo del material?",
    "Por ejemplo: comunicar un beneficio o facilitar una tarea.",
    true,
  ],
  [
    "brandObjective",
    "¿Cuál es el objetivo de la marca?",
    "¿Qué decisión o resultado busca la marca con este estudio?",
    true,
  ],
  [
    "audience",
    "¿A qué público está dirigido?",
    "Describe el público objetivo.",
    false,
  ],
  [
    "question",
    "¿Qué quieres resolver con el análisis?",
    "Preguntas, hipótesis o aspectos a priorizar.",
    false,
  ],
] as const;

export function ResearchAnalysisForm({
  id,
  kind,
  context,
  disabled,
}: {
  id: string;
  kind: "study" | "battery";
  context?: ResearchContext;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(runResearchAnalysis, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <h2 className="text-xl font-semibold">Contexto para el análisis</h2>
      <p className="text-sm text-muted">
        Completa o actualiza este contexto antes de generar el análisis. Se
        conserva con cada informe. Evita incluir datos personales.
      </p>
      {fields.map(([name, label, placeholder, required]) => (
        <label key={name} className="block space-y-1 text-sm">
          <span className="font-medium">
            {label}
            {required ? " *" : " (opcional)"}
          </span>
          <textarea
            name={name}
            required={required}
            maxLength={1200}
            rows={2}
            defaultValue={context?.[name] ?? ""}
            placeholder={placeholder}
            className="w-full rounded-lg border border-control bg-background p-3"
            disabled={pending}
          />
        </label>
      ))}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert>El análisis se guardó correctamente.</Alert> : null}
      <div role="status" aria-live="polite">
        {pending
          ? "Analizando los resultados… Esto puede tardar un minuto."
          : null}
      </div>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Analizando…" : "Generar análisis con IA"}
      </Button>
    </form>
  );
}
