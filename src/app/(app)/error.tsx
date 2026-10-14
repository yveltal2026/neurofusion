"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "@/components/ui/button";

/** Error inesperado en una pantalla del investigador: mensaje claro y reintento. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No pudimos mostrar esta pantalla</h1>
      <p className="text-muted">
        Ocurrió un error inesperado. Tus datos no se perdieron. Intenta de nuevo; si se repite, comparte este código con soporte:
        {error.digest ? <code className="ml-1 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-sm">{error.digest}</code> : " (sin código)"}.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Intentar de nuevo
        </Button>
        <Link href="/projects" className={buttonClass("secondary")}>
          Ir a proyectos
        </Link>
      </div>
    </div>
  );
}
