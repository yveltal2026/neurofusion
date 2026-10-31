"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { removeStudyFiles } from "@/lib/study-files";
import { listItems, surveyConfigSchema } from "@/tools/survey/engine";

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

const idSchema = z.string().uuid();

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

export async function updateStudySettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
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
  // RLS limita la actualización a estudios de la propia organización.
  const { data, error } = await supabase.from("studies").update(patch).eq("id", id).select("id");
  if (error || !data?.length) return { error: "No se pudieron guardar los cambios" };

  revalidatePath(`/studies/${id}`);
  return { saved: true };
}

/** Genera un token nuevo: la liga anterior deja de funcionar de inmediato. */
export async function regenerateLink(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("tool_type, config").eq("id", id.data).maybeSingle();
  if (!study) return;
  const eye = study.tool_type === "visual" && typeof study.config === "object" && study.config !== null
    && "mode" in study.config && study.config.mode === "pieces" && "eyeTracking" in study.config && Boolean(study.config.eyeTracking);
  if (!["iat", "survey", "iat_variant"].includes(study.tool_type) && !eye) return;
  await supabase.from("studies").update({ access_token: generateMagicToken() }).eq("id", id.data);
  revalidatePath(`/studies/${id.data}`);
}

export async function deleteStudy(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("project_id, tool_type").eq("id", id.data).maybeSingle();
  // Un estudio que es paso de una batería no se borra desde aquí (la FK lo impide): primero se quita de la batería.
  const { data: usedBy } = await supabase.from("battery_steps").select("battery_id").eq("study_id", id.data).limit(1);
  if (usedBy?.length) redirect(`/studies/${id.data}?blocked=battery`);
  if (study?.tool_type === "visual" || study?.tool_type === "survey") await removeStudyFiles(supabase, id.data);
  // Borra también sesiones, ensayos, resultados, auditorías y piezas (ON DELETE CASCADE).
  await supabase.from("studies").delete().eq("id", id.data);
  redirect(study ? `/projects/${study.project_id}` : "/projects");
}

const renameSchema = z.object({ id: idSchema, name: z.string().trim().min(1, "Escribe un nombre").max(160, "Máximo 160 caracteres") });

export async function renameStudy(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = renameSchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("studies").update({ name: parsed.data.name }).eq("id", parsed.data.id).select("id");
  if (error || !data?.length) return { error: "No se pudo renombrar el estudio" };
  revalidatePath(`/studies/${parsed.data.id}`, "layout");
  return { saved: true };
}

const duplicateSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().trim().max(160).optional(),
});

/**
 * Copia un estudio con participantes (IAT o encuesta) en el mismo proyecto o en otro de la organización:
 * misma configuración, liga nueva y estado «borrador», sin respuestas. Sirve de plantilla (el docente prepara
 * un estudio base y cada equipo lo copia). El copiado es de configuración, no de datos.
 */
export async function duplicateStudy(formData: FormData) {
  const parsed = duplicateSchema.safeParse({
    id: formData.get("id"),
    projectId: formData.get("projectId"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) return;
  const { id, projectId, name } = parsed.data;

  const { supabase } = await requireUser();
  const { data: source } = await supabase
    .from("studies")
    .select("name, tool_type, config, duplicate_policy")
    .eq("id", id)
    .in("tool_type", ["iat", "survey", "iat_variant"])
    .maybeSingle();
  if (!source) return;

  const { data: copy, error } = await supabase
    .from("studies")
    .insert({
      project_id: projectId,
      tool_type: source.tool_type,
      name: (name || `${source.name} (copia)`).slice(0, 160),
      status: "draft",
      config: source.config,
      duplicate_policy: source.duplicate_policy,
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();
  // RLS rechaza el insert si el proyecto destino no es de la organización del usuario.
  if (error || !copy) return;
  if (source.tool_type === "survey") {
    const parsedConfig = surveyConfigSchema.safeParse(source.config);
    if (parsedConfig.success && listItems(parsedConfig.data).some((item) => item.image)) {
      try {
        const { copySurveyImages } = await import("@/tools/survey/images.server");
        const config = await copySurveyImages(supabase, id, copy.id, parsedConfig.data);
        const { data: saved, error: saveError } = await supabase.from("studies").update({ config })
          .eq("id", copy.id).eq("status", "draft").select("id").maybeSingle();
        if (saveError || !saved) throw new Error("No se pudo guardar la copia");
      } catch {
        await removeStudyFiles(supabase, copy.id);
        await supabase.from("studies").delete().eq("id", copy.id).eq("status", "draft");
        return;
      }
    }
  }
  redirect(`/studies/${copy.id}?copied=1`);
}
