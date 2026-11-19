"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
import { createClient } from "@/lib/supabase/client";
import { registerAsset } from "../actions";
import { PlacementHint, PlacementSelect } from "./placement-select";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Sube imágenes directo al bucket privado (la sesión del analista + RLS de Storage deciden
 * el acceso) y luego pide al servidor registrarlas: el servidor verifica y mide cada archivo.
 */
export function AssetUploader({
  studyId,
  siteKey = null,
  taskId = null,
  withPlacement = false,
  compact = false,
}: {
  studyId: string;
  siteKey?: string | null;
  taskId?: string | null;
  withPlacement?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ name: string; error?: string }[]>([]);
  // En piezas gráficas el formato es obligatorio: define qué se revisa y orienta la lectura de la IA.
  const needsPlacement = withPlacement && !placement;

  const upload = async () => {
    if (needsPlacement) {
      setLog([{ name: "Formato", error: "Elige el formato antes de subir las imágenes" }]);
      return;
    }
    setBusy(true);
    setLog([]);
    const supabase = createClient();
    const out: { name: string; error?: string }[] = [];
    for (const f of files) {
      if (!ACCEPT.includes(f.type)) {
        out.push({ name: f.name, error: "Formato no soportado (usa PNG, JPEG o WebP)" });
        continue;
      }
      if (f.size > MAX_BYTES) {
        out.push({ name: f.name, error: "Pesa más de 10 MB" });
        continue;
      }
      const path = `${studyId}/${crypto.randomUUID()}.${EXT[f.type]}`;
      const { error } = await supabase.storage.from("study-assets").upload(path, f, { contentType: f.type, upsert: false });
      if (error) {
        out.push({ name: f.name, error: "No se pudo subir el archivo" });
        continue;
      }
      const res = await registerAsset({ studyId, path, fileName: f.name, title: "", placement: placement || null, siteKey, taskId });
      out.push({ name: f.name, error: res.error });
      setLog([...out]);
    }
    setLog(out);
    setFiles([]);
    setBusy(false);
    router.refresh();
  };

  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <FilePicker key={log.length ? "after" : "before"} label="Elegir imágenes" accept={ACCEPT.join(",")} multiple onFiles={setFiles} disabled={busy || needsPlacement} />
      <Button type="button" variant={compact ? "secondary" : "primary"} onClick={upload} disabled={busy || needsPlacement || files.length === 0}>
        {busy ? "Subiendo…" : `Subir${files.length ? ` (${files.length})` : ""}`}
      </Button>
    </div>
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {withPlacement ? (
        <div className="grid items-start gap-x-6 gap-y-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <label htmlFor={`placement-${studyId}`} className="block text-sm font-medium text-heading">
              1. Formato de las piezas
            </label>
            <PlacementSelect
              id={`placement-${studyId}`}
              value={placement}
              onChange={(e) => {
                setPlacement(e.target.value);
                setLog([]);
              }}
              disabled={busy}
              required
            />
            {placement ? <PlacementHint id={placement} /> : <p className="text-xs text-muted">Obligatorio. Define la revisión de tamaño, proporción y peso.</p>}
          </div>
          <div className="space-y-1.5">
            <p className={`text-sm font-medium ${needsPlacement ? "text-muted" : "text-heading"}`}>2. Imágenes</p>
            {picker}
            {needsPlacement ? <p className="text-xs text-muted">Elige primero el formato. Para piezas de formatos distintos, súbelas por tandas.</p> : null}
          </div>
        </div>
      ) : (
        picker
      )}
      {log.filter((l) => l.error).map((l) => (
        <Alert key={l.name} tone="error">
          {l.name}: {l.error}
        </Alert>
      ))}
    </div>
  );
}
