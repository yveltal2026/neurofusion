/**
 * Un runner de IAT o de encuesta puede correr como paso de una batería. En ese modo omite su propio
 * consentimiento, pantalla de bienvenida y despedida (los cubre la batería), enlaza su sesión con la
 * sesión de batería y avisa al terminar.
 */
export interface EmbeddedStep {
  batterySessionId: string;
  /** Se llama una vez, cuando el participante termina el paso y sus datos ya están guardados. */
  onComplete: () => void;
}
