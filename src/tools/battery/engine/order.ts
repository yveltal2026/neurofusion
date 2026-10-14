/**
 * Orden y composición de una batería. Código puro, sin I/O.
 *
 * La plataforma SUGIERE un orden por familia de medida; el investigador decide: puede
 * intercambiar pasos y omitir los que no necesite. Los avisos metodológicos no bloquean.
 */

/** Herramientas con participantes que pueden ser un paso de batería. */
export const BATTERY_TOOLS = ["iat", "survey"] as const;
export type BatteryToolType = (typeof BATTERY_TOOLS)[number];

export function isBatteryTool(toolType: string): toolType is BatteryToolType {
  return (BATTERY_TOOLS as readonly string[]).includes(toolType);
}

/**
 * Familia de medida de un paso. `exposure` (estimulación y mirada) quedará para el eye
 * tracking y las pruebas de estímulos; hoy ninguna herramienta la usa.
 */
export type StepFamily = "exposure" | "implicit" | "explicit";

export const FAMILY_RANK: Record<StepFamily, number> = {
  exposure: 0,
  implicit: 1,
  explicit: 2,
};

export const FAMILY_BY_TOOL: Record<BatteryToolType, StepFamily> = {
  iat: "implicit",
  survey: "explicit",
};

export const FAMILY_LABEL: Record<StepFamily, string> = {
  exposure: "Exposición",
  implicit: "Medida implícita",
  explicit: "Medida explícita",
};

/** Un paso tal como lo edita el investigador. El orden es la posición en la lista. */
export interface BatteryStep {
  studyId: string;
  toolType: BatteryToolType;
  /** Nombre del estudio (para mensajes). */
  name: string;
  /** false = omitido: conserva su lugar y su configuración, pero el participante no lo corre. */
  enabled: boolean;
}

export const MAX_STEPS = 12;

export function familyOf(step: Pick<BatteryStep, "toolType">): StepFamily {
  return FAMILY_BY_TOOL[step.toolType];
}

/**
 * Orden sugerido: exposición → implícita → explícita. Estable: dentro de una misma familia
 * se respeta el orden en que ya estaban. No modifica la lista recibida.
 */
export function suggestOrder<T extends Pick<BatteryStep, "toolType">>(
  steps: readonly T[],
): T[] {
  return steps
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) =>
        FAMILY_RANK[familyOf(a.step)] - FAMILY_RANK[familyOf(b.step)] ||
        a.index - b.index,
    )
    .map(({ step }) => step);
}

/** ¿El orden actual ya coincide con el sugerido? (para mostrar u ocultar «Restaurar orden sugerido»). */
export function isSuggestedOrder(steps: readonly BatteryStep[]): boolean {
  const suggested = suggestOrder(steps);
  return steps.every((s, i) => s.studyId === suggested[i]!.studyId);
}

/** Ids de estudio que corre el participante: los pasos activos, en el orden guardado. */
export function runOrder(steps: readonly BatteryStep[]): string[] {
  return steps.filter((s) => s.enabled).map((s) => s.studyId);
}

// ----------------------------------------------------------------- edición

/** Mueve un paso una posición (−1 arriba, +1 abajo). Fuera de rango no hace nada. */
export function moveStep<T>(
  steps: readonly T[],
  index: number,
  delta: -1 | 1,
): T[] {
  const to = index + delta;
  if (index < 0 || index >= steps.length || to < 0 || to >= steps.length)
    return [...steps];
  const out = [...steps];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** Activa u omite un paso sin cambiarle el lugar. */
export function toggleStep(
  steps: readonly BatteryStep[],
  studyId: string,
): BatteryStep[] {
  return steps.map((s) =>
    s.studyId === studyId ? { ...s, enabled: !s.enabled } : s,
  );
}

export function removeStep(
  steps: readonly BatteryStep[],
  studyId: string,
): BatteryStep[] {
  return steps.filter((s) => s.studyId !== studyId);
}

/** Agrega un paso al final (activo). Si el estudio ya está en la batería, no lo duplica. */
export function addStep(
  steps: readonly BatteryStep[],
  step: Omit<BatteryStep, "enabled">,
): BatteryStep[] {
  if (steps.some((s) => s.studyId === step.studyId)) return [...steps];
  return [...steps, { ...step, enabled: true }];
}

// ----------------------------------------------------------------- avisos y validación

export type WarningCode = "explicit_before_implicit" | "single_active_step";

export interface OrderWarning {
  code: WarningCode;
  message: string;
  /** Pasos implicados, para resaltarlos en la interfaz. */
  studyIds: string[];
}

/**
 * Avisos metodológicos sobre el orden elegido. Sólo consideran los pasos ACTIVOS: un paso
 * omitido no influye en lo que vive el participante. Ninguno impide guardar.
 */
export function orderWarnings(steps: readonly BatteryStep[]): OrderWarning[] {
  const active = steps.filter((s) => s.enabled);
  const out: OrderWarning[] = [];

  // Una medida explícita antes de una implícita puede activar el concepto y influir en ella.
  for (const implicit of active.filter((s) => familyOf(s) === "implicit")) {
    const implicitIndex = active.indexOf(implicit);
    const before = active.filter(
      (s, i) => i < implicitIndex && familyOf(s) === "explicit",
    );
    if (before.length) {
      out.push({
        code: "explicit_before_implicit",
        message:
          `«${before.map((b) => b.name).join("», «")}» va antes de «${implicit.name}». Responder preguntas explícitas antes de una prueba implícita ` +
          "sobre el mismo concepto puede influir en las asociaciones medidas. Si es a propósito, ignora este aviso.",
        studyIds: [...before.map((b) => b.studyId), implicit.studyId],
      });
    }
  }

  if (active.length === 1) {
    out.push({
      code: "single_active_step",
      message:
        "Sólo hay un paso activo. Para una sola herramienta puede ser más simple crear un estudio de una herramienta.",
      studyIds: [active[0]!.studyId],
    });
  }
  return out;
}

/** Errores que impiden guardar la batería (a diferencia de los avisos). */
export function validateComposition(steps: readonly BatteryStep[]): string[] {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("Agrega al menos un paso.");
  if (steps.length > MAX_STEPS)
    errors.push(`Una batería admite como máximo ${MAX_STEPS} pasos.`);
  if (new Set(steps.map((s) => s.studyId)).size !== steps.length)
    errors.push("Un mismo estudio no puede aparecer dos veces.");
  if (steps.length > 0 && !steps.some((s) => s.enabled))
    errors.push("Deja al menos un paso activo.");
  return errors;
}
