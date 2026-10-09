import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente con service role: IGNORA RLS. Sólo para los endpoints públicos del
 * participante, que validan el token del estudio antes de tocar datos.
 * Nunca importar desde código de cliente.
 */
export function createAdminClient() {
  const { supabaseUrl } = publicEnv();
  return createClient(supabaseUrl, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
