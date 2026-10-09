import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Devuelve al investigador autenticado y su organización activa.
 * En V1 cada usuario tiene una organización personal (creada por trigger);
 * al pasar a SaaS aquí se resolverá la org seleccionada.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    throw new Error("El usuario no tiene organización. Revisa el trigger handle_new_user.");
  }
  return { supabase, user, orgId: membership.org_id as string };
}
