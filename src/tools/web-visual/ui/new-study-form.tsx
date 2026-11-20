"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createWebVisualStudy } from "../actions";
import {
  WEB_DEVICE_FOCUS,
  WEB_DEVICE_FOCUS_LABEL,
  WEB_PAGE_TYPES,
  WEB_PAGE_TYPE_LABEL,
  type WebDeviceFocus,
  type WebPageType,
} from "../config";

const selectClass =
  "w-full rounded-md border border-control bg-background px-3 py-2 text-sm";

export function NewWebVisualStudyForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"single" | "flow">("single");
  const [pageType, setPageType] = useState<WebPageType>("landing");
  const [deviceFocus, setDeviceFocus] = useState<WebDeviceFocus>("desktop");
  const [objective, setObjective] = useState("");
  const [primaryCta, setPrimaryCta] = useState("");
  const [brand, setBrand] = useState("");
  const [audience, setAudience] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createWebVisualStudy({
        projectId,
        name,
        config: {
          mode,
          pageType,
          deviceFocus,
          objective,
          primaryCta,
          brand,
          audience,
        },
      });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Nombre del estudio">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={160}
          placeholder="Landing principal · versión Q4"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Modo de evaluación</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "single",
                "Capturas individuales",
                "Sube una o varias vistas del sitio (desktop o móvil) para evaluar atención y jerarquía.",
              ],
              [
                "flow",
                "Flujo de pantallas",
                "Sube una secuencia ordenada de capturas (p. ej. landing → carrito → checkout).",
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de página">
          <select
            className={selectClass}
            value={pageType}
            onChange={(e) => setPageType(e.target.value as WebPageType)}
          >
            {WEB_PAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {WEB_PAGE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dispositivo objetivo">
          <select
            className={selectClass}
            value={deviceFocus}
            onChange={(e) => setDeviceFocus(e.target.value as WebDeviceFocus)}
          >
            {WEB_DEVICE_FOCUS.map((d) => (
              <option key={d} value={d}>
                {WEB_DEVICE_FOCUS_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Objetivo principal de la página">
        <Textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          required
          maxLength={600}
          rows={3}
          placeholder="Que el visitante entienda la propuesta de valor en 3 segundos y haga clic en Solicitar demo."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="CTA principal esperado (opcional)">
          <Input
            value={primaryCta}
            onChange={(e) => setPrimaryCta(e.target.value)}
            maxLength={160}
            placeholder="Solicitar demo"
          />
        </Field>
        <Field label="Marca / sitio (opcional)">
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={120}
            placeholder="Aesteros"
          />
        </Field>
        <Field label="Público objetivo (opcional)">
          <Input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={400}
            placeholder="Directores de marketing B2B"
          />
        </Field>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creando..." : "Crear estudio y subir capturas"}
      </Button>
    </form>
  );
}
