"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { requestResearcherVideoUpload, saveStudyVideoSource } from "../actions";

const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export interface VideoSetupCardProps {
  studyId: string;
  r2Configured: boolean;
  r2Key?: string;
  playbackUrl?: string;
  title?: string;
  locked: boolean;
  maxDurationSeconds?: number;
}

export function VideoSetupCard({
  studyId,
  r2Configured,
  r2Key,
  playbackUrl,
  title,
  locked, maxDurationSeconds = 120,
}: VideoSetupCardProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState(playbackUrl ?? "");
  const [titleInput, setTitleInput] = useState(title ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  async function handleFileUpload() {
    if (!selectedFile) return;
    setError(null);
    setStatus(null);

    if (selectedFile.type !== "video/mp4" && selectedFile.type !== "video/webm") {
      setError("Formato no soportado. Usa un video MP4 o WebM.");
      return;
    }
    if (selectedFile.size > MAX_VIDEO_BYTES) {
      setError("El video pesa más de 150 MB.");
      return;
    }

    setUploading(true);
    try {
      const metadata = await new Promise<{ durationMs: number; videoWidth: number; videoHeight: number }>((resolve, reject) => {
        const video = document.createElement("video");
        const localUrl = URL.createObjectURL(selectedFile);
        const dispose = () => { video.onloadedmetadata = null; video.onerror = null; clearTimeout(timeout); URL.revokeObjectURL(localUrl); video.removeAttribute("src"); video.load(); };
        const timeout = setTimeout(() => { dispose(); reject(new Error("No se pudo leer la duración del video.")); }, 10_000);
        video.onloadedmetadata = () => {
          const result = { durationMs: Math.round(video.duration * 1000), videoWidth: video.videoWidth, videoHeight: video.videoHeight };
          dispose();
          if (!Number.isFinite(result.durationMs) || result.durationMs < 1000 || result.durationMs > maxDurationSeconds * 1000) {
            reject(new Error(`El video debe durar entre 1 y ${maxDurationSeconds} segundos.`));
          } else resolve(result);
        };
        video.onerror = () => { dispose(); reject(new Error("No se pudo leer este video. Usa MP4 o WebM compatible con el navegador.")); };
        video.preload = "metadata"; video.src = localUrl;
      });
      const session = await requestResearcherVideoUpload({
        studyId,
        mimeType: selectedFile.type,
        byteLength: selectedFile.size,
      });
      if (session.error || !session.uploadUrl || !session.storageKey) {
        setError(session.error ?? "No se pudo iniciar la subida del video.");
        return;
      }

      const put = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: session.requiredHeaders,
        body: selectedFile,
      });
      if (!put.ok) {
        setError(`No se pudo subir el video al almacenamiento de la plataforma (${put.status}).`);
        return;
      }

      const saved = await saveStudyVideoSource({
        studyId,
        r2Key: session.storageKey, ...metadata,
        playbackUrl: session.playbackUrl,
        title: titleInput.trim() || selectedFile.name,
      });
      if (saved.error) {
        setError(saved.error);
        return;
      }

      if (session.playbackUrl) setUrlInput(session.playbackUrl);
      setTitleInput((prev) => prev.trim() || selectedFile.name);
      setSelectedFile(null);
      setStatus("Video subido y vinculado al estudio.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo completar la subida del video.");
    } finally {
      setUploading(false);
    }
  }

  function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    start(async () => {
      const res = await saveStudyVideoSource({
        studyId,
        playbackUrl: urlInput.trim() || undefined,
        title: titleInput.trim() || undefined,
      });
      if (res.error) setError(res.error);
      else {
        setStatus("Fuente de video guardada.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Archivo de video del estudio</h3>
          <p className="text-xs text-muted">
            {r2Key
              ? `Video cargado en la plataforma${title ? ` · ${title}` : ""}.`
              : playbackUrl
                ? "Video vinculado mediante enlace directo."
                : "Sube un video MP4 o WebM desde tu computadora (máx. 150 MB)."}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            r2Configured
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {r2Configured ? "Subida de video activa" : "Almacenamiento en configuración"}
        </span>
      </div>

      {!r2Configured ? (
        <Alert tone="warning">
          La subida directa de videos aún está pendiente de activación por el administrador de la plataforma (faltan las credenciales de almacenamiento en el servidor). Mientras tanto, puedes usar un enlace directo MP4/WebM abajo.
        </Alert>
      ) : null}

      {locked ? (
        <Alert tone="info">
          El video ya no se puede reemplazar porque existen respuestas o sesiones en curso.
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-heading">Subir video desde tu computadora</p>
            <div className="flex flex-wrap items-center gap-2">
              <FilePicker
                label="Elegir video"
                accept="video/mp4,video/webm"
                disabled={!r2Configured || uploading}
                onFiles={(files) => {
                  setSelectedFile(files[0] ?? null);
                  setError(null);
                  setStatus(null);
                }}
              />
              <Button
                type="button"
                disabled={!r2Configured || uploading || !selectedFile}
                onClick={handleFileUpload}
              >
                {uploading ? "Subiendo video…" : "Subir video"}
              </Button>
            </div>
            <p className="text-xs text-muted">
              MP4 o WebM de hasta 150 MB. El video se guarda directamente en la plataforma; los usuarios no necesitan cuentas externas.
            </p>
          </div>

          <form onSubmit={saveUrl} className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted">Opcional: título personalizado o enlace directo a un video alojado en otro servidor</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título del video (opcional)">
                <Input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  maxLength={160}
                  placeholder="Spot Buen Fin 30s"
                />
              </Field>
              <Field label="Enlace directo MP4/WebM (opcional)">
                <Input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  maxLength={2000}
                  placeholder="https://cdn.ejemplo.com/video.mp4"
                />
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={pending || uploading}>
              {pending ? "Guardando…" : "Guardar enlace / título"}
            </Button>
          </form>
        </div>
      )}

      {playbackUrl ? (
        <video
          src={playbackUrl}
          controls
          preload="metadata"
          className="aspect-video max-h-[320px] w-full rounded-md border border-border bg-black object-contain"
        />
      ) : null}

      {status ? <Alert>{status}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Card>
  );
}
