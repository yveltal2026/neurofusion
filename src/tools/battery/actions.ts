"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SettingsState } from "@/app/(app)/studies/[id]/actions";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { batteryConfigSchema, MAX_STEPS, validateComposition } from "./engine";
import { exposureStepsWithoutPieces } from "./load";

const idSchema = z.string().uuid();

const stepsSchema = z
  .array(z.object({ studyId: idSchema, enabled: z.boolean() }))
  .max(MAX_STEPS, `Una batería admite como máximo ${MAX_STEPS} pasos`);

type StepInput = z.infer<typeof stepsSchema>[number];

/** Mensaje legible de un error de la base (los disparadores de integridad usan el código 23514). */
function dbMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  return error?.code === "23514" && error.message ? error.message : fallback;
}

const toRpcSteps = (steps: readonly StepInput[]) =>
  steps.map((s) => ({ study_id: s.studyId, enabled: s.enabled }));

const noPiecesMessage = (names: string[]) =>
  `«${names.join("», «")}» no tiene imágenes que mostrar. Súbelas en ese estudio antes de usarlo como paso.`;

export interface BatteryActionResult {
  error?: string;
  saved?: boolean;
}

// ----------------------------------------------------------------- crear

const createSchema = z.object({
  projectId: idSchema,
  name: z.string().trim().min(1, "Escribe un nombre para la batería").max(160),
  config: batteryConfigSchema,
  steps: stepsSchema,
});

/**
 * Crea la batería y la publica con su liga mágica. La validación del servidor es autoritativa: el
 * estado, el token y la herramienta los fija el servidor, y la base de datos valida que cada paso sea
 * un estudio con participantes (IAT, variante, encuesta) o de imagen con IA del mismo proyecto.
 */
export async function createBattery(
  raw: unknown,
): Promise<BatteryActionResult> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ??
        "La configuración de la batería no es válida",
    };
  const { projectId, name, config, steps } = parsed.data;

  const problems = validateComposition(steps);
  if (problems.length) return { error: problems[0] };

  const { supabase } = await requireUser();
  const empty = await exposureStepsWithoutPieces(supabase, steps);
  if (empty.length) return { error: noPiecesMessage(empty) };
  const { data, error } = await supabase
    .from("batteries")
    .insert({
      project_id: projectId,
      name,
      status: "published",
      config,
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();
  // RLS rechaza el insert si el proyecto no pertenece a la organización del usuario.
  if (error || !data)
    return {
      error: "No se pudo crear la batería. Verifica que el proyecto exista.",
    };

  const { error: stepsError } = await supabase.rpc("save_battery_steps", {
    p_battery: data.id,
    p_steps: toRpcSteps(steps),
  });
  if (stepsError) {
    // No dejar una batería publicada sin pasos.
    await supabase.from("batteries").delete().eq("id", data.id);
    return {
      error: dbMessage(
        stepsError,
        "No se pudieron guardar los pasos. Verifica que los estudios existan en este proyecto.",
      ),
    };
  }
  redirect(`/batteries/${data.id}?created=1`);
}

// ----------------------------------------------------------------- editar pasos

const saveStepsSchema = z.object({ batteryId: idSchema, steps: stepsSchema });

/** Reemplaza los pasos (orden y activos). La base de datos lo rechaza si la batería ya tiene participantes. */
export async function saveBatterySteps(
  raw: unknown,
): Promise<BatteryActionResult> {
  const parsed = saveStepsSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { batteryId, steps } = parsed.data;

  const problems = validateComposition(steps);
  if (problems.length) return { error: problems[0] };

  const { supabase } = await requireUser();
  const empty = await exposureStepsWithoutPieces(supabase, steps);
  if (empty.length) return { error: noPiecesMessage(empty) };
  const { error } = await supabase.rpc("save_battery_steps", {
    p_battery: batteryId,
    p_steps: toRpcSteps(steps),
  });
  if (error)
    return { error: dbMessage(error, "No se pudieron guardar los pasos") };

  revalidatePath(`/batteries/${batteryId}`);
  return { saved: true };
}

// ----------------------------------------------------------------- ajustes

const settingsSchema = z.object({
  id: idSchema,
  status: z.enum(["draft", "published", "closed"]),
  duplicate_policy: z.enum(["device_cookie", "device_cookie_and_ip", "none"]),
  max_responses: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(
      z
        .number()
        .int("Debe ser un número entero")
        .positive("Debe ser mayor a 0")
        .max(100000)
        .nullable(),
    ),
  closes_at: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().datetime({ message: "Fecha inválida" }).nullable()),
});

export async function updateBatterySettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    duplicate_policy: formData.get("duplicate_policy"),
    max_responses: formData.get("max_responses") ?? "",
    closes_at: formData.get("closes_at") ?? "",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireUser();

  // Publicar una batería sin pasos activos dejaría a los participantes sin nada que hacer.
  if (patch.status === "published") {
    const { count } = await supabase
      .from("battery_steps")
      .select("study_id", { count: "exact", head: true })
      .eq("battery_id", id)
      .eq("enabled", true);
    if (!count)
      return {
        error: "Agrega al menos un paso activo antes de publicar la batería",
      };
  }

  // RLS limita la actualización a baterías de la propia organización.
  const { data, error } = await supabase
    .from("batteries")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error || !data?.length)
    return { error: "No se pudieron guardar los cambios" };

  revalidatePath(`/batteries/${id}`);
  return { saved: true };
}

// ----------------------------------------------------------------- liga, borrado y copia

/** Genera un token nuevo: la liga anterior deja de funcionar de inmediato. */
export async function regenerateBatteryLink(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  await supabase
    .from("batteries")
    .update({ access_token: generateMagicToken() })
    .eq("id", id.data);
  revalidatePath(`/batteries/${id.data}`);
}

/** Borra la batería con sus sesiones y los datos de los pasos ligados a ellas (los estudios no se borran). */
export async function deleteBattery(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const { data: battery } = await supabase
    .from("batteries")
    .select("project_id")
    .eq("id", id.data)
    .maybeSingle();
  await supabase.from("batteries").delete().eq("id", id.data);
  redirect(battery ? `/projects/${battery.project_id}` : "/projects");
}

/**
 * Copia la batería (mismos textos y pasos, sin participantes) como borrador. Es la vía para cambiar el
 * orden o los pasos de una batería que ya tiene respuestas, sin mezclar muestras de órdenes distintos.
 */
export async function duplicateBattery(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();

  const { data: source } = await supabase
    .from("batteries")
    .select(
      "project_id, name, config, max_responses, closes_at, duplicate_policy",
    )
    .eq("id", id.data)
    .maybeSingle();
  if (!source) return;
  const { data: steps } = await supabase
    .from("battery_steps")
    .select("study_id, enabled, position")
    .eq("battery_id", id.data)
    .order("position");

  const { data: copy, error } = await supabase
    .from("batteries")
    .insert({
      project_id: source.project_id,
      name: `${source.name} (copia)`.slice(0, 160),
      status: "draft",
      config: source.config,
      max_responses: source.max_responses,
      closes_at: null,
      duplicate_policy: source.duplicate_policy,
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();
  if (error || !copy) return;

  const { error: stepsError } = await supabase.rpc("save_battery_steps", {
    p_battery: copy.id,
    p_steps: (steps ?? []).map((s) => ({
      study_id: s.study_id,
      enabled: s.enabled,
    })),
  });
  if (stepsError) {
    await supabase.from("batteries").delete().eq("id", copy.id);
    return;
  }
  redirect(`/batteries/${copy.id}?duplicated=1`);
}

const excludeSchema = z.object({
  id: idSchema,
  batteryId: idSchema,
  excluded: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/**
 * Excluye (o reincorpora) a un participante del informe integrado. No borra nada: los datos siguen
 * en la base y en el CSV con la marca. RLS limita la escritura a participantes de la propia
 * organización, y la base sólo deja cambiar estas dos columnas.
 */
export async function setParticipantExcluded(formData: FormData) {
  const parsed = excludeSchema.safeParse({
    id: formData.get("id"),
    batteryId: formData.get("batteryId"),
    excluded: formData.get("excluded"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return;
  const { id, batteryId, excluded, reason } = parsed.data;
  const { supabase } = await requireUser();
  await supabase
    .from("battery_sessions")
    .update({ excluded, excluded_reason: excluded ? reason : null })
    .eq("id", id)
    .eq("battery_id", batteryId);
  revalidatePath(`/batteries/${batteryId}`);
  revalidatePath(`/batteries/${batteryId}/report`);
}
