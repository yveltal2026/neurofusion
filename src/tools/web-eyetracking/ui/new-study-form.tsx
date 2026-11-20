"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createWebEyetrackingStudy } from "../actions";
import type { WebEyeMode, WebEyeStep } from "../config";

const selectClass =
  "w-full rounded-md border border-control bg-background px-3 py-2 text-sm";

const DEFAULT_STEPS: WebEyeStep[] = [
  {
    id: "S1",
    title: "Primera impresión",
    instruction:
      "Explora la página principal durante unos segundos y ubica la propuesta de valor.",
    advanceOn: "manual",
  },
  {
    id: "S2",
    title: "Buscar acción principal",
    instruction:
      "Encuentra el botón principal de registro o compra y avanza al completarlo.",
    advanceOn: "manual",
  },
];

export function NewWebEyetrackingStudyForm({
  projectId,
}: {
  projectId: string;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<WebEyeMode>("live_snippet");
  const [targetUrl, setTargetUrl] = useState("");
  const [steps, setSteps] = useState<WebEyeStep[]>(DEFAULT_STEPS);
  const [points, setPoints] = useState<5 | 9>(9);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const updateStep = (index: number, patch: Partial<WebEyeStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const addStep = () => {
    if (steps.length >= 12) return;
    let next = steps.length + 1;
    while (steps.some((s) => s.id === `S${next}`)) next += 1;
    setSteps((prev) => [
      ...prev,
      {
        id: `S${next}`,
        title: "",
        instruction: "",
        advanceOn: "manual",
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createWebEyetrackingStudy({
        projectId,
        name,
        config: {
          mode,
          targetUrl,
          steps,
          calibration: { points, maxDurationSeconds: 180 },
        },
      });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del estudio">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={160}
            placeholder="Usabilidad checkout · noviembre"
          />
        </Field>
        <Field label="URL objetivo a analizar">
          <Input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            required
            maxLength={2000}
            placeholder="https://tusitio.com/landing"
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Modo de captura</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "live_snippet",
                "Sitio en vivo (snippet en <head>)",
                "Inserta un script ligero en el sitio. El usuario navega la web real guiado por una barra flotante de pasos.",
              ],
              [
                "no_code_captures",
                "Sin código (capturas web con scroll)",
                "Ideal si no tienes acceso al código del sitio (p. ej. competencia). Subes capturas largas por paso y el usuario las recorre dentro de Aesteros.",
              ],
            ] as const
          ).map(([m, title, desc]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg border p-4 text-left transition ${
                mode === m
                  ? "border-primary bg-surface"
                  : "border-border hover:border-muted"
              }`}
            >
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted">{desc}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              Pasos e instrucciones ({steps.length}/12)
            </p>
            <p className="text-xs text-muted">
              Define las tareas que el participante deberá completar en orden.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={addStep}
            disabled={steps.length >= 12}
          >
            Añadir paso
          </Button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Paso {i + 1} · {step.id}
                </span>
                {steps.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="text-xs text-danger hover:underline"
                  >
                    Quitar
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Título del paso">
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(i, { title: e.target.value })}
                    required
                    maxLength={100}
                    placeholder="Encontrar planes y precios"
                  />
                </Field>
                <Field label="Criterio de avance">
                  <select
                    className={selectClass}
                    value={step.advanceOn}
                    onChange={(e) =>
                      updateStep(i, {
                        advanceOn: e.target.value as WebEyeStep["advanceOn"],
                      })
                    }
                  >
                    <option value="manual">Botón «Siguiente paso»</option>
                    {mode === "live_snippet" ? (
                      <option value="url_match">Al navegar a una URL</option>
                    ) : null}
                  </select>
                </Field>
              </div>

              <Field label="Instrucción para el participante">
                <Textarea
                  value={step.instruction}
                  onChange={(e) =>
                    updateStep(i, { instruction: e.target.value })
                  }
                  required
                  maxLength={400}
                  rows={2}
                  placeholder="Busca el plan Pro y compara lo que incluye."
                />
              </Field>

              {step.advanceOn === "url_match" ? (
                <Field label="Fragmento de URL esperado (p. ej. /pricing)">
                  <Input
                    value={step.urlPattern ?? ""}
                    onChange={(e) =>
                      updateStep(i, { urlPattern: e.target.value })
                    }
                    required
                    maxLength={300}
                    placeholder="/pricing"
                  />
                </Field>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Field label="Puntos de calibración de webcam">
        <select
          className={selectClass}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value) === 5 ? 5 : 9)}
        >
          <option value={9}>9 puntos (mayor precisión recomendada)</option>
          <option value={5}>5 puntos (calibración rápida)</option>
        </select>
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creando..." : "Crear estudio de Eyetracking Web"}
      </Button>
    </form>
  );
}
