import { z } from "zod";

/**
 * Configuración de una batería (lo que ve el participante) y orden de los pasos.
 * Código puro, sin I/O: se valida igual en el cliente y, de forma autoritativa, en el servidor.
 */

export const BATTERY_ENGINE_VERSION = "nf-battery-1.0";

export const MAX_BATTERY_STEPS = 8;

const text = (max: number) => z.string().trim().min(1, "Campo obligatorio").max(max, `Máximo ${max} caracteres`);

export const batteryConfigSchema = z.object({
  version: z.literal(1),
  texts: z.object({ consent: text(4000), thankYou: text(1000) }),
});
export type BatteryConfig = z.infer<typeof batteryConfigSchema>;

export const DEFAULT_BATTERY_THANK_YOU =
  "¡Gracias por participar! Tus respuestas se han registrado correctamente. Ya puedes cerrar esta ventana.";

/** Consentimiento por defecto; el investigador lo edita y su equipo legal debe validarlo antes de usar la liga con personas reales. */
export function defaultBatteryConsent(name: string): string {
  return [
    `Estás invitado(a) a participar en un estudio: «${name || "estudio"}».`,
    "Te pediremos completar varias actividades seguidas (por ejemplo, un test de asociación y una encuesta). Dura unos minutos y se explica antes de cada una.",
    "Tu participación es voluntaria y confidencial: no te pedimos nombre ni correo, y tus respuestas se analizan de forma agregada con fines de investigación.",
    "Puedes abandonar el estudio en cualquier momento cerrando esta ventana. Al continuar confirmas que tienes 18 años o más y que aceptas participar.",
  ].join("\n\n");
}

// ---------------------------------------------------------------- pasos

export type StepTool = "iat" | "survey";

/** Lo que el orden y los avisos necesitan saber de cada paso. */
export interface StepInfo {
  studyId: string;
  name: string;
  tool: StepTool;
  enabled: boolean;
  /** Estado del estudio hijo: sólo uno publicado puede completarse. */
  studyStatus: "draft" | "published" | "closed";
  /** Duración estimada en minutos (0 si no se conoce). */
  minutes?: number;
}

/** Familias de medida, en el orden sugerido: exposición → implícita → explícita (ver docs/DISENO_COMPOSITOR.md §3.4). */
const FAMILY_RANK: Record<StepTool, number> = { iat: 1, survey: 2 };

/** Orden sugerido por la plataforma. Es un punto de partida: el investigador puede cambiarlo. Estable dentro de cada familia. */
export function suggestOrder<T extends Pick<StepInfo, "tool">>(steps: readonly T[]): T[] {
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => FAMILY_RANK[a.s.tool] - FAMILY_RANK[b.s.tool] || a.i - b.i)
    .map((x) => x.s);
}

export type WarningLevel = "error" | "warning" | "info";
export interface OrderWarning {
  level: WarningLevel;
  /** Identificador estable para poder descartar el aviso. */
  code: "no_steps" | "single_step" | "unpublished_step" | "explicit_before_implicit" | "too_long";
  text: string;
}

/** Duración por encima de la cual se avisa (minutos): la atención y el abandono empeoran en sesiones largas. */
export const LONG_SESSION_MINUTES = 20;

/**
 * Avisos metodológicos sobre los pasos y su orden. Son avisos, no bloqueos: salvo los de nivel «error»
 * (que impiden publicar), el investigador decide.
 */
export function orderWarnings(steps: readonly StepInfo[]): OrderWarning[] {
  const active = steps.filter((s) => s.enabled);
  const out: OrderWarning[] = [];
  if (active.length === 0) {
    out.push({ level: "error", code: "no_steps", text: "No hay pasos activos: agrega al menos un estudio a la batería." });
    return out;
  }
  if (active.length === 1)
    out.push({ level: "info", code: "single_step", text: "Con un solo paso activo no hace falta una batería: puedes usar el estudio directamente." });
  for (const s of active) {
    if (s.studyStatus !== "published")
      out.push({
        level: "error",
        code: "unpublished_step",
        text: `«${s.name}» no está publicado: el participante no podría completarlo. Publícalo en sus Ajustes antes de abrir la batería.`,
      });
  }
  const firstIat = active.findIndex((s) => s.tool === "iat");
  const firstSurvey = active.findIndex((s) => s.tool === "survey");
  if (firstIat !== -1 && firstSurvey !== -1 && firstSurvey < firstIat)
    out.push({
      level: "warning",
      code: "explicit_before_implicit",
      text: "Una encuesta antes del IAT puede influir en las asociaciones implícitas si pregunta por el mismo concepto. Si no es tu intención, pon el IAT primero.",
    });
  const total = active.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  if (total > LONG_SESSION_MINUTES)
    out.push({
      level: "warning",
      code: "too_long",
      text: `La sesión dura unos ${Math.round(total)} minutos. Pasados ${LONG_SESSION_MINUTES} aumenta el abandono y baja la calidad de los tiempos de reacción.`,
    });
  return out;
}

/** ¿Hay avisos de nivel error? (impiden publicar la batería). */
export const hasBlockingWarnings = (w: readonly OrderWarning[]) => w.some((x) => x.level === "error");

/** Pasos activos, en orden: lo único que corre el participante. */
export function runOrder<T extends Pick<StepInfo, "enabled" | "studyId">>(steps: readonly T[]): string[] {
  return steps.filter((s) => s.enabled).map((s) => s.studyId);
}
