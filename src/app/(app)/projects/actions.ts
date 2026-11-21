"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanCreateProject } from "@/lib/plans/server";
import { removeStudyFiles } from "@/lib/study-files";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(120, "Máximo 120 caracteres"),
  description: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
});

export interface ProjectFormState {
  error?: string;
  ok?: boolean;
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
  const quota = await assertCanCreateProject(supabase, orgId);
  if (!quota.ok) return { error: quota.error };

  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name: parsed.data.name, description: parsed.data.description ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear el proyecto" };

  revalidatePath("/projects");
  redirect(`/projects/${data.id}?created=1`);
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Identificador de proyecto inválido." };
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .update({ name: parsed.data.name, description: parsed.data.description ?? null })
    .eq("id", id.data);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  return { ok: true };
}

export async function deleteProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Identificador de proyecto inválido." };
  const { supabase } = await requireUser();
  // Los archivos del Storage no se borran en cascada con las filas.
  const { data: visual } = await supabase.from("studies").select("id").eq("project_id", id.data).eq("tool_type", "visual");
  for (const s of visual ?? []) await removeStudyFiles(supabase, s.id);
  // RLS garantiza que sólo se borran proyectos de la propia organización.
  const { error } = await supabase.from("projects").delete().eq("id", id.data);
  if (error) return { error: "No se pudo eliminar el proyecto. Intenta de nuevo." };
  revalidatePath("/projects");
  redirect("/projects?deleted=1");
}
