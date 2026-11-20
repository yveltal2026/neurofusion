"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import type { StudyRow } from "@/lib/db/types";
import { webVisualConfigSchema, type WebVisualConfig } from "./config";

export interface WebVisualFormState {
  error?: string;
  ok?: boolean;
}

const uuid = z.string().uuid();
const createSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160),
  config: z.unknown(),
});

export async function createWebVisualStudy(
  raw: unknown,
): Promise<WebVisualFormState> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const config = webVisualConfigSchema.safeParse(parsed.data.config);
  if (!config.success) {
    return {
      error: config.error.issues[0]?.message ?? "La configuración no es válida",
    };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: parsed.data.projectId,
      tool_type: "web_visual",
      name: parsed.data.name,
      status: "published",
      config: config.data,
      access_token: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      error: "No se pudo crear el estudio. Verifica que el proyecto exista.",
    };
  }
  redirect(`/studies/${data.id}?created=1`);
}

export async function updateWebVisualContext(
  _prev: WebVisualFormState,
  fd: FormData,
): Promise<WebVisualFormState> {
  const id = uuid.safeParse(fd.get("studyId"));
  if (!id.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const { data: study } = await supabase
    .from("studies")
    .select("id, config")
    .eq("id", id.data)
    .eq("tool_type", "web_visual")
    .maybeSingle<Pick<StudyRow, "id" | "config">>();
  if (!study) return { error: "Estudio no encontrado" };

  const current = webVisualConfigSchema.safeParse(study.config);
  if (!current.success) return { error: "Configuración inválida" };

  const next: WebVisualConfig = {
    ...current.data,
    objective: String(fd.get("objective") ?? ""),
    primaryCta: String(fd.get("primaryCta") ?? ""),
    brand: String(fd.get("brand") ?? ""),
    audience: String(fd.get("audience") ?? ""),
  };
  const validated = webVisualConfigSchema.safeParse(next);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { error } = await supabase
    .from("studies")
    .update({ config: validated.data })
    .eq("id", id.data);
  if (error) return { error: "No se pudieron guardar los cambios" };
  revalidatePath(`/studies/${id.data}`, "layout");
  return { ok: true };
}
