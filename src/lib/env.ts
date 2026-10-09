import { z } from "zod";

/**
 * Variables públicas (se inlinean en el cliente). Se leen con acceso estático
 * `process.env.NEXT_PUBLIC_*` para que Next las sustituya en el bundle.
 */
export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PARTICIPANT_LOCK_SECRET: z.string().min(16),
});

/** Variables sólo de servidor. Falla con un mensaje claro si faltan. */
export function serverEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Faltan o son inválidas variables de entorno de servidor: ${missing}`);
  }
  return parsed.data;
}
