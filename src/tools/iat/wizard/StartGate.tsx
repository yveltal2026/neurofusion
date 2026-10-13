"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { suggestIatDesign } from "./ai-actions";
import { MAX_BRIEF_CHARS, MIN_BRIEF_CHARS, type ConfigPatch } from "./ai-suggest";
import { RadioCard, StepShell } from "./ui";

/** Pantalla previa al paso 1: capturar todo manualmente o dejar que la IA proponga el diseño. */
export function StartGate({
  projectId,
  projectName,
  aiAvailable,
  onManual,
  onSuggested,
}: {
  projectId: string;
  projectName: string;
  aiAvailable: boolean;
  onManual: () => void;
  onSuggested: (patch: ConfigPatch, notes: string) => void;
}) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function suggest() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await suggestIatDesign(brief);
        if (res.ok) onSuggested(res.patch, res.notes);
        else setError(res.error);
      } catch {
        setError("No se pudo generar la sugerencia. Inténtalo de nuevo o captura los datos manualmente.");
      }
    });
  }

  const briefLength = brief.trim().length;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">Proyecto: {projectName}</p>
      <Card className="space-y-5">
        <StepShell title="Antes de empezar" question="¿Cómo quieres diseñar tu estudio?">
          <div className="space-y-3">
            <RadioCard name="mode" checked={mode === "manual"} onChange={() => setMode("manual")} title="Capturar todo manualmente">
              Tú defines el producto, los conceptos, las dimensiones y las palabras de cada polo.
            </RadioCard>
            <RadioCard
              name="mode"
              checked={mode === "ai"}
              onChange={() => setMode("ai")}
              disabled={!aiAvailable}
              title="Asistido por IA"
              badge={aiAvailable ? "Nuevo" : "No disponible"}
            >
              {aiAvailable
                ? "Describe en pocas líneas qué quieres analizar y su contexto; la IA propone las dimensiones, sus polos y las palabras estímulo. Después puedes editar todo."
                : "Requiere configurar la API key del proveedor de IA en el servidor (ver README)."}
            </RadioCard>
          </div>

          {mode === "ai" ? (
            <div className="space-y-3">
              <Field
                label="¿Qué quieres analizar y en qué contexto?"
                hint='Ej. "Quiero saber cómo perciben los universitarios de CDMX a Starbucks frente a Café Punta del Cielo en cuanto a confianza y calidad". Puedes mencionar las marcas, la categoría, el público y el objetivo.'
              >
                <Textarea
                  rows={5}
                  value={brief}
                  maxLength={MAX_BRIEF_CHARS}
                  onChange={(e) => setBrief(e.target.value)}
                  disabled={pending}
                />
              </Field>
              <p className="text-xs text-muted">
                {briefLength}/{MAX_BRIEF_CHARS} caracteres · mínimo {MIN_BRIEF_CHARS}. Sólo se envía este texto a la IA.
              </p>
            </div>
          ) : null}

          {error ? <Alert tone="error">{error}</Alert> : null}
        </StepShell>
      </Card>

      <div className="flex items-center justify-between">
        <Link href={`/projects/${projectId}`} className="inline-block py-1 text-sm text-muted hover:underline">
          Cancelar
        </Link>
        {mode === "ai" ? (
          <Button type="button" onClick={suggest} disabled={pending || briefLength < MIN_BRIEF_CHARS}>
            {pending ? "Generando propuesta…" : "Sugerir diseño con IA"}
          </Button>
        ) : (
          <Button type="button" onClick={onManual}>
            Comenzar
          </Button>
        )}
      </div>
    </div>
  );
}
