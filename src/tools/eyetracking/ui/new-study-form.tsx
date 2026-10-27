"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createEyeTrackingStudy } from "../actions";

export function NewEyeTrackingStudyForm({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await createEyeTrackingStudy({
        projectId,
        name: fd.get("name"),
        config: {
          mode: "pieces",
          objective: fd.get("objective"),
          brand: fd.get("brand"),
          audience: fd.get("audience"),
          eyeTracking: { durationSeconds: Number(fd.get("durationSeconds")) },
        },
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Nombre del estudio">
        <Input name="name" required maxLength={160} placeholder="Atención visual · Campaña Buen Fin" />
      </Field>
      <Field label="Objetivo" hint="Qué quieres investigar sobre la atención de tus participantes.">
        <Textarea name="objective" required maxLength={600} placeholder="Identificar si los participantes miran el precio y la promoción." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marca (opcional)"><Input name="brand" maxLength={120} /></Field>
        <Field label="Público objetivo (opcional)"><Input name="audience" maxLength={400} /></Field>
      </div>
      <Field label="Segundos por imagen" hint="Entre 5 y 30 segundos. Cada participante verá hasta 5 imágenes.">
        <Input name="durationSeconds" type="number" min={5} max={30} step={1} defaultValue={10} required />
      </Field>
      <p className="text-sm text-muted">
        Después de crear el estudio, sube tus imágenes y comparte la liga de participación.
        Cada participante acepta el uso de cámara, calibra su mirada y observa las imágenes.
        Se guardan coordenadas y calidad de medición; el video se procesa en el dispositivo y no se almacena.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" disabled={pending}>{pending ? "Creando estudio…" : "Crear estudio de eye tracking"}</Button>
    </form>
  );
}
