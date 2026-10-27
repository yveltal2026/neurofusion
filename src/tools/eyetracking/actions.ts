"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import { createEyeStudySchema } from "./config";

export async function createEyeTrackingStudy(raw: unknown): Promise<{ error?: string }> {
  const parsed = createEyeStudySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { supabase } = await requireUser();
  // Reutiliza el almacenamiento de imágenes y conserva compatibilidad con estudios previos.
  const { data, error } = await supabase.from("studies").insert({
    project_id: parsed.data.projectId,
    tool_type: "visual",
    name: parsed.data.name,
    status: "published",
    config: parsed.data.config,
    access_token: generateMagicToken(),
  }).select("id").single();
  if (error || !data) return { error: "No se pudo crear el estudio. Verifica que el proyecto exista." };
  redirect(`/studies/${data.id}?created=1`);
}
