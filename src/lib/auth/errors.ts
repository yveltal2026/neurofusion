interface AuthErrorLike {
  code?: string;
  status?: number;
}

/**
 * Traduce errores de Supabase Auth a mensajes para la persona. Lo que no se reconoce cae en `fallback`,
 * nunca en el texto en inglés del servidor.
 */
export function authErrorMessage(error: AuthErrorLike, fallback: string): string {
  switch (error.code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "Se alcanzó el límite de correos que podemos enviar por ahora. Espera un rato e inténtalo de nuevo; si sigue igual, avisa a quien administra la plataforma.";
    case "email_address_not_authorized":
      return "El envío de correos aún no está configurado para esta dirección. Avisa a quien administra la plataforma.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo. Inicia sesión o restablece tu contraseña.";
    case "weak_password":
      return "Esa contraseña es muy fácil de adivinar. Usa una más larga o más variada.";
    case "same_password":
      return "La contraseña nueva debe ser distinta a la anterior.";
  }
  return error.status === 429 ? authErrorMessage({ code: "over_request_rate_limit" }, fallback) : fallback;
}
