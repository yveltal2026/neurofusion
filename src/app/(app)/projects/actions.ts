"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(120, "Máximo 120 caracteres"),
  description: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
});

export interface ProjectFormState {
  error?: string;
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, orgId } = await requireUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name: parsed.data.name, description: parsed.data.description ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear el proyecto" };

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function deleteProject(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  // RLS garantiza que sólo se borran proyectos de la propia organización.
  await supabase.from("projects").delete().eq("id", id.data);
  revalidatePath("/projects");
  redirect("/projects");
}
