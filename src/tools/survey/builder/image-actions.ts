"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { removeStudyFiles } from "@/lib/study-files";
import { listItems, surveyConfigSchema } from "../engine";
import { verifySurveyImages } from "../images.server";

const inputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  config: surveyConfigSchema,
});

/** Se reserva un borrador para que RLS autorice la subida directa a Storage. */
export async function prepareSurveyImages(
  raw: unknown,
): Promise<{ studyId?: string; error?: string }> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "La configuración de la encuesta no es válida." };
  const { supabase } = await requireUser();
  const { projectId, name, config } = parsed.data;
  if (listItems(config).some((item) => item.image))
    return { error: "Sube las imágenes después de preparar la encuesta." };
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: projectId,
      name,
      config,
      tool_type: "survey",
      status: "draft",
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();
  return error || !data
    ? { error: "No se pudo preparar la encuesta. Verifica el proyecto." }
    : { studyId: data.id };
}

const publishSchema = inputSchema.extend({ studyId: z.string().uuid() });

/** Publica sólo después de verificar el contenido de cada archivo con la sesión del investigador. */
export async function publishSurveyImages(
  raw: unknown,
): Promise<{ studyId?: string; error?: string }> {
  const parsed = publishSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "La configuración de la encuesta no es válida." };
  const { studyId, projectId, name, config } = parsed.data;
  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id")
    .eq("id", studyId)
    .eq("project_id", projectId)
    .eq("tool_type", "survey")
    .eq("status", "draft")
    .maybeSingle();
  if (!study) return { error: "No se encontró el borrador de la encuesta." };
  const problem = await verifySurveyImages(supabase, studyId, config);
  if (problem) return { error: problem };
  const { data, error } = await supabase
    .from("studies")
    .update({ name, config, status: "published" })
    .eq("id", studyId)
    .eq("tool_type", "survey")
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  return error || !data
    ? { error: "No se pudo publicar la encuesta." }
    : { studyId: data.id };
}

/** Limpia un intento fallido; nunca borra un estudio publicado. */
export async function discardSurveyImages(studyId: string): Promise<void> {
  if (!z.string().uuid().safeParse(studyId).success) return;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("studies")
    .select("id")
    .eq("id", studyId)
    .eq("tool_type", "survey")
    .eq("status", "draft")
    .maybeSingle();
  if (!data) return;
  await removeStudyFiles(supabase, studyId);
  await supabase
    .from("studies")
    .delete()
    .eq("id", studyId)
    .eq("status", "draft")
    .eq("tool_type", "survey");
}
