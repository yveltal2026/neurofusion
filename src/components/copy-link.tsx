"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Liga mágica del estudio"
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
        />
        <Button type="button" variant="secondary" onClick={copy}>
          {status === "copied" ? "¡Copiada!" : "Copiar"}
        </Button>
      </div>
      <p aria-live="polite" className="text-xs text-muted">
        {status === "copied"
          ? "Liga copiada al portapapeles."
          : status === "error"
            ? "No se pudo copiar automáticamente; selecciona la liga y usa Ctrl+C / Cmd+C."
            : ""}
      </p>
    </div>
  );
}
