"use client";

import { StatusScreen } from "@/components/participant";
import { Button } from "@/components/ui/button";

export function ParticipationExpired({
  battery = false,
}: {
  battery?: boolean;
}) {
  return (
    <StatusScreen
      icon="refresh"
      title="Participación inactiva"
      role="alert"
      actions={
        <Button onClick={() => window.location.reload()}>
          Volver a abrir la participación
        </Button>
      }
    >
      <p>
      Esta participación ya no está activa.{" "}
        {battery
          ? "Puedes retomar la batería; los pasos completados se conservan."
          : "Vuelve a iniciar el estudio desde esta liga."}
      </p>
    </StatusScreen>
  );
}
