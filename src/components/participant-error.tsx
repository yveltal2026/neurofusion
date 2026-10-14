"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error inesperado en una pantalla del PARTICIPANTE (liga de estudio o de batería). Lenguaje llano,
 * sin jerga y sin culpar a la persona: puede reintentar o avisar a quien le compartió la liga.
 */
export function ParticipantError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        No pudimos cargar esta página
      </h1>
      <p className="text-muted">
        Algo falló de nuestro lado, no del tuyo. Si ya habías empezado, puedes
        volver a abrir la misma liga más tarde desde este mismo dispositivo y
        retomar donde ibas. Si el problema continúa, avisa a la persona que te
        compartió la liga
        {error.digest ? (
          <>
            {" "}
            y dile este código:{" "}
            <code className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-sm">
              {error.digest}
            </code>
          </>
        ) : null}
        .
      </p>
      <Button type="button" onClick={() => retry()}>
        Intentar de nuevo
      </Button>
    </main>
  );
}
