"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";

export interface AccountActionState {
  error?: string;
  saved?: boolean;
}

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Escribe tu nombre").max(120, "Máximo 120 caracteres"),
});

const passwordSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export async function updateProfile(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = profileSchema.safeParse({ full_name: formData.get("full_name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nombre inválido" };

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.full_name },
  });
  if (error) return { error: "No se pudo actualizar tu perfil" };

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function updatePassword(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Contraseña inválida" };

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message || "No se pudo actualizar la contraseña" };

  return { saved: true };
}
