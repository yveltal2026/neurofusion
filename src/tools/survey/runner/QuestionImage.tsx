"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function QuestionImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="mb-5 space-y-3">
      {failed ? (
        <Alert tone="error">
          No se pudo cargar la imagen de esta pregunta.
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar imagen
          </Button>
        </Alert>
      ) : (
        // Imagen privada servida por la liga del estudio; se conserva completa y sin recortes.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${src}${attempt ? `?retry=${attempt}` : ""}`}
          alt={alt || "Imagen para evaluar"}
          onError={() => setFailed(true)}
          className="max-h-[70dvh] w-full rounded-lg object-contain"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
