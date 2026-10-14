import { z } from "zod";

export const MIN_PASSWORD = 8;
// bcrypt (el hash de Supabase Auth) sólo considera los primeros 72 bytes.
export const MAX_PASSWORD = 72;

export const resetRequestSchema = z.object({
  email: z.string().trim().email("Correo inválido"),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
      .max(MAX_PASSWORD, `La contraseña no puede pasar de ${MAX_PASSWORD} caracteres`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });
