"use client";

import { useEffect, useState } from "react";

/** Mounted only while a request is pending. Elapsed time is not server progress. */
export function AnalysisActivity() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p role="status" className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-primary/25 border-t-primary motion-safe:animate-spin" />
        Solicitud de análisis en curso
      </p>
      <p className="text-sm tabular-nums" aria-live="off">
        Tiempo transcurrido: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </p>
      <p className="text-xs text-muted">
        Esperando el resultado y la confirmación de guardado. Mantén esta página abierta.
        El tiempo transcurrido no indica el porcentaje de avance.
      </p>
      {seconds >= 60 ? (
        <p role="status" className="text-xs text-muted">
          La solicitud está tardando más de un minuto. Aún no se ha recibido una respuesta;
          aquí aparecerá el resultado o un mensaje de error cuando termine.
        </p>
      ) : null}
    </div>
  );
}
