import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/lib/participant-api";

/**
 * Vínculo entre la sesión de un paso (IAT o encuesta) y la sesión de batería. Lo usan las rutas
 * `start` de cada herramienta cuando reciben un `batterySessionId`. La base de datos valida que el
 * estudio sea un paso de esa sesión y que se respete el orden (función `link_battery_step`).
 */

export type LinkResult = { ok: true } | { ok: false; code: ApiErrorCode };

/** Traduce el resultado de `link_battery_step` a un código público. */
export function linkOutcomeToCode(
  outcome: string | null | undefined,
): ApiErrorCode | null {
  switch (outcome) {
    case "ok":
      return null;
    case "out_of_order":
      return "out_of_order";
    case "battery_session_closed":
      return "closed";
    case "study_not_in_battery":
    case "already_linked":
    case "session_not_started":
      return "invalid_data";
    case "session_not_found":
    case "battery_session_not_found":
      return "not_found";
    default:
      return "server_error";
  }
}

/** Enlaza una sesión recién creada a la sesión de batería. Si no se puede, la sesión se abandona. */
export async function linkStepSession(
  admin: SupabaseClient,
  sessionId: string,
  batterySessionId: string,
): Promise<LinkResult> {
  const { data, error } = await admin.rpc("link_battery_step", {
    p_session: sessionId,
    p_battery_session: batterySessionId,
  });
  const code = error
    ? "server_error"
    : linkOutcomeToCode(typeof data === "string" ? data : null);
  if (code === null) return { ok: true };

  // No dejar una sesión huérfana que cuente para el límite de respuestas del paso.
  await admin
    .from("sessions")
    .update({ status: "abandoned" })
    .eq("id", sessionId)
    .eq("status", "started");
  return { ok: false, code };
}
