"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { newPasswordSchema, resetRequestSchema } from "@/lib/auth/password-reset";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const credentials = z.object({
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv().appUrl;
}

/** Sólo rutas internas, para evitar open-redirects con ?next=. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Correo o contraseña incorrectos" };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const fullName = String(formData.get("full_name") ?? "").trim() || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${await origin()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  // Con confirmación de correo activa no hay sesión todavía.
  if (!data.session) {
    return { message: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a iniciar sesión." };
  }
  redirect("/projects");
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

const RESET_WINDOW_MS = 15 * 60_000;

/**
 * Envía el enlace para restablecer la contraseña. La respuesta es la misma exista o no la cuenta,
 * para no revelar qué correos están registrados.
 */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data.email.toLowerCase();

  // Freno básico contra correos masivos: por cuenta y por IP (en memoria, ver rate-limit.ts).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  const byEmail = rateLimit(`pwreset:email:${email}`, 3, RESET_WINDOW_MS);
  const byIp = rateLimit(`pwreset:ip:${ip}`, 10, RESET_WINDOW_MS);
  if (!byEmail.ok || !byIp.ok) {
    return { error: "Hiciste varios intentos seguidos. Espera unos minutos e inténtalo de nuevo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos." };
  return {
    message:
      "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa también tu carpeta de spam.",
  };
}

/** Guarda la contraseña nueva. Requiere la sesión de recuperación que abre el enlace del correo. */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "La contraseña nueva debe ser distinta a la anterior." };
    if (error.code === "weak_password") return { error: "Esa contraseña es muy fácil de adivinar. Usa una más larga o más variada." };
    return { error: "No pudimos actualizar tu contraseña. Inténtalo de nuevo." };
  }
  // Se cierra la sesión de recuperación: la persona entra con la contraseña nueva y confirma que funciona.
  await supabase.auth.signOut();
  redirect("/login?reset=ok");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
