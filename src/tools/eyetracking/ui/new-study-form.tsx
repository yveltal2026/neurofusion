"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createEyeTrackingStudy } from "../actions";

interface SceneDraft {
  id: string;
  label: string;
  startSec: string;
  endSec: string;
}

export function NewEyeTrackingStudyForm({ projectId }: { projectId: string }) {
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [facialCoding, setFacialCoding] = useState(false);
  const [scenes, setScenes] = useState<SceneDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function selectMediaType(next: "image" | "video") {
    setMediaType(next);
    setFacialCoding(next === "video");
  }

  function addScene() {
    const idx = scenes.length + 1;
    const prevEnd = scenes.length ? Number(scenes[scenes.length - 1].endSec) || 0 : 0;
    setScenes((prev) => [
      ...prev,
      {
        id: `scene-${idx}`,
        label: `Escena ${idx}`,
        startSec: String(prevEnd),
        endSec: String(prevEnd + 15),
      },
    ]);
  }

  function updateScene(index: number, patch: Partial<SceneDraft>) {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeScene(index: number) {
    setScenes((prev) => prev.filter((_, i) => i !== index));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    const normalizedScenes = scenes.map((s, idx) => ({
      index: idx + 1,
      id: s.id,
      label: s.label.trim(),
      startMs: Math.round((Number(s.startSec) || 0) * 1000),
      endMs: Math.round((Number(s.endSec) || 0) * 1000),
    }));
    if (mediaType === "video") {
      const bad = normalizedScenes.find((s) => s.label.length === 0 || s.endMs <= s.startMs);
      if (bad) {
        setError(
          bad.label.length === 0
            ? `La escena ${bad.index} necesita un nombre.`
            : `En la escena ${bad.index} («${bad.label}»), el segundo final debe ser mayor que el inicial.`,
        );
        return;
      }
    }

    const eyeTracking =
      mediaType === "image"
        ? {
            mediaType: "image" as const,
            durationSeconds: Number(fd.get("durationSeconds") ?? 10),
            facialCoding,
          }
        : {
            mediaType: "video" as const,
            durationSeconds: 10,
            facialCoding,
            video: {
              storage: "cloudflare_r2" as const,
              maxDurationSeconds: Number(fd.get("maxDurationSeconds") ?? 120),
              scenes: normalizedScenes.map(({ id, label, startMs, endMs }) => ({ id, label, startMs, endMs })),
            },
          };

    start(async () => {
      const result = await createEyeTrackingStudy({
        projectId,
        name: fd.get("name"),
        config: {
          mode: "pieces",
          objective: fd.get("objective"),
          brand: fd.get("brand"),
          audience: fd.get("audience"),
          eyeTracking,
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo de estímulo</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "image",
                "Imágenes (hasta 5)",
                "Piezas gráficas PNG, JPEG o WebP. Mide fijaciones, recorridos y mapas de calor con webcam.",
              ],
              [
                "video",
                "Video + Facial Coding",
                "Video MP4 o WebM subido directamente en la plataforma (hasta 5 min). Mide mirada, áreas de interés dinámicas y expresiones faciales.",
              ],
            ] as const
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border p-4 transition focus-within:outline-2 focus-within:outline-accent-ink ${
                mediaType === value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="mediaType"
                value={value}
                checked={mediaType === value}
                onChange={() => selectMediaType(value)}
                className="sr-only"
              />
              <span className="font-medium">{title}</span>
              <span className="mt-1 block text-sm text-muted">{desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Objetivo" hint="Qué quieres investigar sobre la atención y respuesta de tus participantes.">
        <Textarea name="objective" required maxLength={600} placeholder="Identificar si los participantes miran el precio, la promoción y qué reacción emocional muestran." />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marca (opcional)"><Input name="brand" maxLength={120} /></Field>
        <Field label="Público objetivo (opcional)"><Input name="audience" maxLength={400} /></Field>
      </div>

      {mediaType === "image" ? (
        <div className="space-y-4">
          <Field label="Segundos por imagen" hint="Entre 5 y 30 segundos. Cada participante verá hasta 5 imágenes.">
            <Input name="durationSeconds" type="number" min={5} max={30} step={1} defaultValue={10} required />
          </Field>
          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={facialCoding}
              onChange={(e) => setFacialCoding(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Medir expresiones faciales (opcional)</span>
              <span className="block text-xs text-muted">
                Detecta gestos del rostro (sistema FACS, por ejemplo ceño fruncido o sonrisa) y estima valencia (agrado o rechazo) y sorpresa directo en el dispositivo del participante.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-surface-muted/30 p-4">
          <Field label="Duración máxima del video (s)" hint="Entre 5 y 300 segundos (5 min).">
            <Input name="maxDurationSeconds" type="number" min={5} max={300} step={1} defaultValue={120} required />
          </Field>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={facialCoding}
              onChange={(e) => setFacialCoding(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Medir expresiones faciales (opcional)</span>
              <span className="block text-xs text-muted">
                Mide sonrisa, fricción/ceño, agrado o rechazo (valencia) y sorpresa sincronizados con lo que el participante mira (calibración neutral de 3 s al inicio).
              </span>
            </span>
          </label>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Escenas del video (opcional)</p>
                <p className="text-xs text-muted">Define segmentos temporales para agrupar mirada y emoción por escena.</p>
              </div>
              <Button type="button" variant="secondary" onClick={addScene}>
                + Agregar escena
              </Button>
            </div>
            {scenes.map((scene, idx) => (
              <div key={scene.id} className="grid items-end gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
                <Field label={`Nombre escena ${idx + 1}`}>
                  <Input
                    value={scene.label}
                    onChange={(e) => updateScene(idx, { label: e.target.value })}
                    maxLength={120}
                    placeholder="Intro / Hook"
                  />
                </Field>
                <Field label="Inicio (s)">
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    step={1}
                    value={scene.startSec}
                    onChange={(e) => updateScene(idx, { startSec: e.target.value })}
                  />
                </Field>
                <Field label="Fin (s)">
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    step={1}
                    value={scene.endSec}
                    onChange={(e) => updateScene(idx, { endSec: e.target.value })}
                  />
                </Field>
                <Button type="button" variant="ghost" onClick={() => removeScene(idx)}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-muted">
        {mediaType === "image"
          ? "Después de crear el estudio, sube tus imágenes desde aquí y comparte la liga de participación. Cada participante acepta el uso de cámara, calibra su mirada y observa las imágenes. El video de la cámara se procesa en el dispositivo y no se almacena."
          : "Después de crear el estudio, podrás subir tu video MP4 o WebM directamente desde esta plataforma y compartir la liga de participación. Cada participante calibra su mirada y línea base neutral de 3 s; la cámara nunca se graba."}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" disabled={pending}>{pending ? "Creando estudio…" : "Crear estudio de eye tracking"}</Button>
    </form>
  );
}
