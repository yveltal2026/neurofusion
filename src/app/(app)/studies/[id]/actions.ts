"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";

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
  await supabase.from("studies").update({ access_token: generateMagicToken() }).eq("id", id.data);
  revalidatePath(`/studies/${id.data}`);
}

export async function deleteStudy(formData: FormData) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("project_id").eq("id", id.data).maybeSingle();
  // Borra también sesiones, ensayos y resultados (ON DELETE CASCADE).
  await supabase.from("studies").delete().eq("id", id.data);
  redirect(study ? `/projects/${study.project_id}` : "/projects");
}
