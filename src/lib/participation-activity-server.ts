import type { SupabaseClient } from "@supabase/supabase-js";

export async function refreshParticipationActivity(
  supabase: SupabaseClient,
  kind: "study" | "battery",
  id: string,
) {
  const { error } = await supabase.rpc("refresh_participation_activity", {
    p_kind: kind,
    p_parent: id,
  });
  if (error)
    throw new Error("No se pudo actualizar el estado de las participaciones");
}
