"use client";

import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión: el navegador permite guardar como PDF. */
export function PrintButton({ label = "Imprimir / guardar PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
