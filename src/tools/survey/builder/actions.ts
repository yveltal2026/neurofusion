"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { surveyConfigSchema } from "../engine";

const inputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160),
  config: surveyConfigSchema,
});

export interface CreateSurveyResult {
  error?: string;
}

/**
 * Crea la encuesta y la publica con su liga mágica. La validación del servidor es
 * autoritativa: la del cliente sólo mejora la experiencia.
 */
export async function createSurveyStudy(
  raw: unknown,
): Promise<CreateSurveyResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "La configuración de la encuesta no es válida",
    };
  }
  const { projectId, name, config } = parsed.data;

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: projectId,
      tool_type: "survey",
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
      error: "No se pudo crear la encuesta. Verifica que el proyecto exista.",
    };
  redirect(`/studies/${data.id}?created=1`);
}
