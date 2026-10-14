import { z } from "zod";
import {
  batteryConfigSchema,
  hasBlockingWarnings,
  MAX_BATTERY_STEPS,
  orderWarnings,
  type BatteryConfig,
  type OrderWarning,
  type StepInfo,
  type StepTool,
} from "./engine/config";
import { estimateStudyMinutes } from "./minutes";

/**
 * Validación pura de lo que el investigador envía al crear o editar una batería. La validación del servidor
 * es autoritativa: la del cliente sólo mejora la experiencia. Sin I/O: recibe los estudios ya leídos (con RLS).
 */

export const batteryInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Escribe un nombre para la batería").max(160, "Máximo 160 caracteres"),
  steps: z
    .array(z.object({ studyId: z.string().uuid(), enabled: z.boolean() }))
    .min(1, "Agrega al menos un estudio a la batería")
    .max(MAX_BATTERY_STEPS, `Máximo ${MAX_BATTERY_STEPS} pasos`),
  texts: batteryConfigSchema.shape.texts,
});
export type BatteryInput = z.infer<typeof batteryInputSchema>;

/** Estudio leído de la base de datos. */
export interface StudyForBattery {
  id: string;
  project_id: string;
  tool_type: string;
  name: string;
  status: "draft" | "published" | "closed";
  config: unknown;
}

export type BuiltBattery =
  | {
      ok: true;
      config: BatteryConfig;
      /** Pasos con su posición, listos para guardar. */
      steps: { position: number; studyId: string; enabled: boolean }[];
      warnings: OrderWarning[];
      /** «published» si no hay avisos bloqueantes; si los hay, queda en borrador. */
      status: "draft" | "published";
    }
  | { ok: false; error: string };

/** Información de cada paso para el orden y los avisos, a partir de los estudios leídos. */
export function toStepInfos(steps: readonly { studyId: string; enabled: boolean }[], studies: readonly StudyForBattery[]): StepInfo[] | null {
  const byId = new Map(studies.map((s) => [s.id, s]));
  const out: StepInfo[] = [];
  for (const s of steps) {
    const study = byId.get(s.studyId);
    if (!study || (study.tool_type !== "iat" && study.tool_type !== "survey")) return null;
    const tool = study.tool_type as StepTool;
    out.push({ studyId: study.id, name: study.name, tool, enabled: s.enabled, studyStatus: study.status, minutes: estimateStudyMinutes(tool, study.config) });
  }
  return out;
}

export function buildBattery(raw: unknown, studies: readonly StudyForBattery[]): BuiltBattery {
  const parsed = batteryInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Los datos de la batería no son válidos" };
  const input = parsed.data;

  if (new Set(input.steps.map((s) => s.studyId)).size !== input.steps.length) return { ok: false, error: "Un estudio no puede repetirse en la batería" };
  if (studies.some((s) => s.project_id !== input.projectId)) return { ok: false, error: "Todos los estudios deben ser del mismo proyecto que la batería" };

  const infos = toStepInfos(input.steps, studies);
  if (!infos) return { ok: false, error: "Sólo los estudios con participantes (IAT, encuesta) del proyecto pueden ser pasos de una batería" };

  const warnings = orderWarnings(infos);
  // «Sin pasos activos» impide crear la batería; «sin publicar» sólo la deja en borrador hasta que se publiquen.
  if (!infos.some((s) => s.enabled)) return { ok: false, error: "No hay pasos activos: deja al menos un estudio activo." };

  return {
    ok: true,
    config: { version: 1, texts: input.texts },
    steps: input.steps.map((s, i) => ({ position: i, studyId: s.studyId, enabled: s.enabled })),
    warnings,
    status: hasBlockingWarnings(warnings) ? "draft" : "published",
  };
}
