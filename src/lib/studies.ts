import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { iatConfigSchema, type IatConfig } from "@/tools/iat/config";
import type { StudyRow } from "@/lib/db/types";

/** Lee todas las filas de una consulta paginando (PostgREST limita a 1000 por petición). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

export interface LoadedStudy {
  study: StudyRow;
  config: IatConfig;
}

/** Estudio + configuración validada, respetando RLS. Responde 404 si no existe o no es del usuario. */
export async function loadStudyForResearcher(supabase: SupabaseClient, id: string): Promise<LoadedStudy> {
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).maybeSingle<StudyRow>();
  if (!study) notFound();
  const config = iatConfigSchema.safeParse(study.config);
  if (!config.success) throw new Error("La configuración guardada del estudio no es válida");
  return { study, config: config.data };
}
