"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
import { createClient } from "@/lib/supabase/client";
import { registerAsset } from "../actions";
import { PLACEMENTS } from "../engine/placements";

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

  const upload = async () => {
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

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <FilePicker key={log.length ? "after" : "before"} label="Elegir imágenes" accept={ACCEPT.join(",")} multiple onFiles={setFiles} disabled={busy} />
        {withPlacement ? (
          <select value={placement} onChange={(e) => setPlacement(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="Formato">
            <option value="">Formato (opcional)</option>
            {PLACEMENTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="button" variant={compact ? "secondary" : "primary"} onClick={upload} disabled={busy || files.length === 0}>
          {busy ? "Subiendo…" : `Subir${files.length ? ` (${files.length})` : ""}`}
        </Button>
      </div>
      {log.filter((l) => l.error).map((l) => (
        <Alert key={l.name} tone="error">
          {l.name}: {l.error}
        </Alert>
      ))}
    </div>
  );
}
