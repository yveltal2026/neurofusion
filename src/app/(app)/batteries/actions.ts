"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { batteryInputSchema, buildBattery, toStepInfos, type StudyForBattery } from "@/tools/battery/builder";
import { batteryConfigSchema, hasBlockingWarnings, orderWarnings } from "@/tools/battery/engine/config";

export interface BatteryActionState {
  error?: string;
  saved?: boolean;
}

const idSchema = z.string().uuid();
const STUDY_COLUMNS = "id, project_id, tool_type, name, status, config";

/**
 * Crea la batería con su liga mágica y sus pasos. La validación del servidor es autoritativa: la del cliente
 * sólo mejora la experiencia. Si algún paso activo no está publicada, queda en borrador (se publica en Ajustes).
 */
export async function createBattery(raw: unknown): Promise<BatteryActionState> {
  const pre = batteryInputSchema.safeParse(raw);
  if (!pre.success) return { error: pre.error.issues[0]?.message ?? "Los datos de la batería no son válidos" };

  const { supabase } = await requireUser();
  // RLS limita la lectura a estudios de la propia organización.
  const { data: studies } = await supabase
    .from("studies")
    .select(STUDY_COLUMNS)
    .in("id", pre.data.steps.map((s) => s.studyId))
    .returns<StudyForBattery[]>();
  const built = buildBattery(raw, studies ?? []);
  if (!built.ok) return { error: built.error };
  if ((studies ?? []).length !== pre.data.steps.length) return { error: "Algún estudio no existe o no es de tu organización" };

  const { data: battery, error } = await supabase
    .from("batteries")
    .insert({
      project_id: pre.data.projectId,
      name: pre.data.name,
      status: built.status,
      config: built.config,
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();
  // RLS rechaza el insert si el proyecto no pertenece a la organización del usuario.
  if (error || !battery) return { error: "No se pudo crear la batería. Verifica que el proyecto exista." };

  const { error: stepsError } = await supabase.from("battery_steps").insert(
    built.steps.map((s) => ({ battery_id: battery.id, position: s.position, study_id: s.studyId, enabled: s.enabled })),
  );
  if (stepsError) {
    await supabase.from("batteries").delete().eq("id", battery.id);
    return { error: "No se pudieron guardar los pasos de la batería." };
  }
  redirect(`/batteries/${battery.id}?created=1`);
}

const settingsSchema = z.object({
  id: idSchema,
  status: z.enum(["draft", "published", "closed"]),
  duplicate_policy: z.enum(["device_cookie", "device_cookie_and_ip", "none"]),
  max_responses: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int("Debe ser un número entero").positive("Debe ser mayor a 0").max(100000).nullable()),
  closes_at: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().datetime({ message: "Fecha inválida" }).nullable()),
});

/** Pasos de una batería con la información que necesitan los avisos. */
async function loadStepInfos(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], batteryId: string) {
  const { data: rows } = await supabase
    .from("battery_steps")
    .select("position, study_id, enabled")
    .eq("battery_id", batteryId)
    .order("position", { ascending: true })
    .returns<{ position: number; study_id: string; enabled: boolean }[]>();
  const steps = (rows ?? []).map((r) => ({ studyId: r.study_id, enabled: r.enabled }));
  const { data: studies } = await supabase
    .from("studies")
    .select(STUDY_COLUMNS)
    .in("id", steps.map((s) => s.studyId))
    .returns<StudyForBattery[]>();
  return toStepInfos(steps, studies ?? []) ?? [];
}

export async function updateBatterySettings(_prev: BatteryActionState, formData: FormData): Promise<BatteryActionState> {
  const parsed = settingsSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    duplicate_policy: formData.get("duplicate_policy"),
    max_responses: formData.get("max_responses") ?? "",
    closes_at: formData.get("closes_at") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireUser();

  // Publicar exige que todos los pasos activos estén publicados: si no, el participante no podría terminar.
  if (patch.status === "published") {
    const blocking = orderWarnings(await loadStepInfos(supabase, id)).filter((w) => w.level === "error");
    if (blocking.length) return { error: blocking[0]!.text };
  }

  // RLS limita la actualización a baterías de la propia organización.
  const { data, error } = await supabase.from("batteries").update(patch).eq("id", id).select("id");
  if (error || !data?.length) return { error: "No se pudieron guardar los cambios" };
  revalidatePath(`/batteries/${id}`);
  return { saved: true };
}

/** Genera un token nuevo: la liga anterior deja de funcionar de inmediato. */
export async function regenerateBatteryLink(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  await supabase.from("batteries").update({ access_token: generateMagicToken() }).eq("id", id.data);
  revalidatePath(`/batteries/${id.data}`);
}

/** Borra la batería, sus pasos y las sesiones de participante (también las de los estudios hijos ligadas a ella). */
export async function deleteBattery(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const { data: battery } = await supabase.from("batteries").select("project_id").eq("id", id.data).maybeSingle();
  await supabase.from("batteries").delete().eq("id", id.data);
  redirect(battery ? `/projects/${battery.project_id}` : "/projects");
}

const stepsInputSchema = z.object({
  id: idSchema,
  steps: batteryInputSchema.shape.steps,
});

/**
 * Cambia el orden y los pasos activos. Sólo si la batería no tiene respuestas: con datos, cambiar el orden
 * mezclaría sesiones corridas de maneras distintas, así que hay que duplicar la batería.
 */
export async function updateBatterySteps(raw: unknown): Promise<BatteryActionState> {
  const parsed = stepsInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, steps } = parsed.data;
  const { supabase } = await requireUser();

  const { data: battery } = await supabase.from("batteries").select("id, project_id, name, config").eq("id", id).maybeSingle();
  if (!battery) return { error: "No encontramos la batería" };
  const texts = batteryConfigSchema.safeParse(battery.config);
  if (!texts.success) return { error: "La configuración guardada de la batería no es válida" };

  const { data: used } = await supabase.from("battery_sessions").select("id").eq("battery_id", id).limit(1);
  if (used?.length) return { error: "La batería ya tiene respuestas: crea otra para cambiar los pasos y mantener los datos comparables." };

  const { data: studies } = await supabase
    .from("studies")
    .select(STUDY_COLUMNS)
    .in("id", steps.map((s) => s.studyId))
    .returns<StudyForBattery[]>();
  if ((studies ?? []).length !== steps.length) return { error: "Algún estudio no existe o no es de tu organización" };
  const built = buildBattery({ projectId: battery.project_id, name: battery.name, steps, texts: texts.data.texts }, studies ?? []);
  if (!built.ok) return { error: built.error };

  const { data: old } = await supabase.from("battery_steps").select("battery_id, position, study_id, enabled").eq("battery_id", id);
  const { error: delError } = await supabase.from("battery_steps").delete().eq("battery_id", id);
  if (delError) return { error: "No se pudieron actualizar los pasos" };
  const { error: insError } = await supabase.from("battery_steps").insert(
    built.steps.map((s) => ({ battery_id: id, position: s.position, study_id: s.studyId, enabled: s.enabled })),
  );
  if (insError) {
    // Sin transacciones en el cliente: se restauran los pasos anteriores para no dejar la batería vacía.
    if (old?.length) await supabase.from("battery_steps").insert(old);
    return { error: "No se pudieron guardar los pasos; se conservaron los anteriores." };
  }
  // Si dejó de cumplir los requisitos para estar abierta (p. ej. un paso sin publicar), pasa a borrador.
  const blocking = hasBlockingWarnings(built.warnings);
  if (blocking) await supabase.from("batteries").update({ status: "draft" }).eq("id", id).eq("status", "published");
  revalidatePath(`/batteries/${id}`);
  return { saved: true };
}
