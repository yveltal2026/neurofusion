import type { SupabaseClient } from "@supabase/supabase-js";

export const ASSETS_BUCKET = "study-assets";

/**
 * Borra los archivos del bucket de un estudio. Las filas se borran en cascada con el
 * estudio, pero los objetos del Storage no: hay que quitarlos explícitamente.
 */
export async function removeStudyFiles(supabase: SupabaseClient, studyId: string): Promise<void> {
  const bucket = supabase.storage.from(ASSETS_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(studyId, { limit: 1000 });
    if (error || !data?.length) return;
    const { error: rmError } = await bucket.remove(data.map((o) => `${studyId}/${o.name}`));
    if (rmError || data.length < 1000) return;
  }
}
