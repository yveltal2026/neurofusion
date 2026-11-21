"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authErrorMessage } from "@/lib/auth/errors";
import { newPasswordSchema, resetRequestSchema } from "@/lib/auth/password-reset";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
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
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase (.env.local) para iniciar sesión." };
  }
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

const signupSchema = credentials.extend({
  full_name: z.string().trim().max(120, "Nombre demasiado largo").optional(),
  audience_segment: z.enum(
    ["researcher", "agency_company", "teacher", "student", "other"],
    { message: "Selecciona qué perfil te describe mejor." },
  ),
  declared_organization: z
    .string()
    .trim()
    .max(120, "El nombre de la organización debe tener máximo 120 caracteres")
    .optional(),
  audience_other_detail: z
    .string()
    .trim()
    .max(120, "El detalle del perfil debe tener máximo 120 caracteres")
    .optional(),
});

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase (.env.local) para crear cuentas." };
  }
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: String(formData.get("full_name") ?? "").trim() || undefined,
    audience_segment: formData.get("audience_segment"),
    declared_organization:
      String(formData.get("declared_organization") ?? "").trim() || undefined,
    audience_other_detail:
      String(formData.get("audience_other_detail") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const {
    email,
    password,
    full_name,
    audience_segment,
    declared_organization,
    audience_other_detail,
  } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Nunca se aceptan plan_tier o créditos desde el cliente; handle_new_user() fija DEMO y +30 créditos.
      data: {
        ...(full_name ? { full_name } : {}),
        audience_segment,
        ...(declared_organization ? { declared_organization } : {}),
        ...(audience_segment === "other" && audience_other_detail
          ? { audience_other_detail }
          : {}),
      },
      emailRedirectTo: `${await origin()}/auth/callback`,
    },
  });
  if (error) {
    console.error("signUp falló", { code: error.code, status: error.status });
    return { error: authErrorMessage(error, "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos.") };
  }
  // Con confirmación de correo activa no hay sesión todavía.
  if (!data.session) {
    return { message: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a iniciar sesión." };
  }
  redirect("/projects");
}

export async function signInWithGoogle(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/entrar?error=config");
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/entrar?error=oauth");
  redirect(data.url);
}

const RESET_WINDOW_MS = 15 * 60_000;

/**
 * Envía el enlace para restablecer la contraseña. La respuesta es la misma exista o no la cuenta,
 * para no revelar qué correos están registrados.
 */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase (.env.local) para restablecer la contraseña." };
  }
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
  if (error) {
    console.error("resetPasswordForEmail falló", { code: error.code, status: error.status });
    return { error: authErrorMessage(error, "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.") };
  }
  return {
    message:
      "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa también tu carpeta de spam.",
  };
}

/** Guarda la contraseña nueva. Requiere la sesión de recuperación que abre el enlace del correo. */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase (.env.local) para actualizar la contraseña." };
  }
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
    return { error: authErrorMessage(error, "No pudimos actualizar tu contraseña. Inténtalo de nuevo.") };
  }
  // Se cierra la sesión de recuperación: la persona entra con la contraseña nueva y confirma que funciona.
  await supabase.auth.signOut();
  redirect("/entrar?reset=ok");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/entrar");
}
