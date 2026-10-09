"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el usuario puede seleccionar el texto manualmente.
      setCopied(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        aria-label="Liga mágica del estudio"
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs"
      />
      <Button type="button" variant="secondary" onClick={copy}>
        {copied ? "¡Copiada!" : "Copiar"}
      </Button>
    </div>
  );
}
