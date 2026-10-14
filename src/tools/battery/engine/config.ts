import { z } from "zod";

/**
 * Configuración de una batería (lo que ve el participante antes y después de los pasos).
 * Los pasos viven en `battery_steps`; aquí sólo van textos. Se valida igual en cliente y servidor.
 */

const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, "Campo obligatorio")
    .max(max, `Máximo ${max} caracteres`);

export const batteryConfigSchema = z.object({
  version: z.literal(1),
  /** Título visible para el participante. */
  title: text(160),
  intro: text(2000).optional(),
  texts: z.object({ consent: text(4000), thankYou: text(1000) }),
});

export type BatteryConfig = z.infer<typeof batteryConfigSchema>;

/** Consentimiento por defecto de la batería; el investigador puede editarlo antes de publicar. */
export function defaultBatteryConsentText(title: string): string {
  return [
    `Estás invitado(a) a participar en un estudio: «${title || "estudio"}».`,
    "Te pediremos completar varias actividades seguidas (pruebas y/o preguntas). Al terminar una pasarás automáticamente a la siguiente.",
    "Tu participación es voluntaria y confidencial: no te pedimos nombre ni correo, y tus respuestas se analizan de forma agregada con fines de investigación.",
    "Puedes abandonar el estudio en cualquier momento cerrando esta ventana. Al continuar confirmas que tienes 18 años o más y que aceptas participar.",
  ].join("\n\n");
}

export const DEFAULT_BATTERY_THANK_YOU =
  "¡Gracias por participar! Completaste todas las actividades y tus respuestas se han registrado correctamente. Ya puedes cerrar esta ventana.";

/** Estado de un paso para un participante, derivado de sus sesiones hijas (nunca de lo que diga el cliente). */
export type StepStatus = "pending" | "in_progress" | "completed";

export interface StepProgress {
  studyId: string;
  status: StepStatus;
}

/** Primer paso que falta por completar, o null si ya terminó todos. */
export function nextStep(
  progress: readonly StepProgress[],
): StepProgress | null {
  return progress.find((p) => p.status !== "completed") ?? null;
}

export function isBatteryComplete(progress: readonly StepProgress[]): boolean {
  return progress.length > 0 && progress.every((p) => p.status === "completed");
}

/**
 * Estado de cada paso de `order` a partir de las sesiones hijas de la sesión de batería.
 * Una sesión `completed` cuenta como terminada; `started` como en curso; `abandoned` se ignora
 * (el paso vuelve a empezar). Si hay varias para un mismo estudio, gana la más avanzada.
 */
export function stepProgress(
  order: readonly string[],
  childSessions: readonly { studyId: string; status: string }[],
): StepProgress[] {
  return order.map((studyId) => {
    const mine = childSessions.filter((s) => s.studyId === studyId);
    const status: StepStatus = mine.some((s) => s.status === "completed")
      ? "completed"
      : mine.some((s) => s.status === "started")
        ? "in_progress"
        : "pending";
    return { studyId, status };
  });
}
