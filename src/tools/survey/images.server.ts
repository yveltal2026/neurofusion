import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSETS_BUCKET } from "@/lib/study-files";
import { listItems, type SurveyConfig } from "./engine";
import { MAX_SURVEY_IMAGE_BYTES } from "./images";

/** Verificación autoritativa: todas las imágenes pertenecen al estudio y son imágenes reales. */
export async function verifySurveyImages(
  supabase: SupabaseClient,
  studyId: string,
  config: SurveyConfig,
): Promise<string | undefined> {
  const paths = [
    ...new Set(
      listItems(config).flatMap((item) =>
        item.image ? [item.image.path] : [],
      ),
    ),
  ];
  if (paths.some((path) => !path.startsWith(`${studyId}/`)))
    return "La imagen no pertenece a esta encuesta.";
  for (const path of paths) {
    const { data, error } = await supabase.storage
      .from(ASSETS_BUCKET)
      .download(path);
    if (error || !data)
      return "No se pudo leer una imagen. Vuelve a intentarlo.";
    if (!data.size || data.size > MAX_SURVEY_IMAGE_BYTES)
      return "La imagen debe pesar entre 1 byte y 10 MB.";
    try {
      const image = sharp(Buffer.from(await data.arrayBuffer()), {
        limitInputPixels: 60_000_000,
      });
      const meta = await image.metadata();
      const extension = { png: "png", jpeg: "jpg", webp: "webp" }[
        meta.format as string
      ];
      if (
        !extension ||
        !meta.width ||
        !meta.height ||
        !path.endsWith(`.${extension}`)
      )
        return "El archivo debe ser una imagen PNG, JPEG o WebP válida.";
      // Decodifica: los encabezados de un archivo truncado no bastan para aceptarlo.
      await image.resize({ width: 1, height: 1 }).raw().toBuffer();
    } catch {
      return "No se pudo abrir la imagen. Usa un archivo PNG, JPEG o WebP válido.";
    }
  }
}

/** La copia debe sobrevivir a la eliminación del original. RLS protege ambos estudios. */
export async function copySurveyImages(
  supabase: SupabaseClient,
  sourceId: string,
  copyId: string,
  config: SurveyConfig,
): Promise<SurveyConfig> {
  const paths = [
    ...new Set(
      listItems(config).flatMap((item) =>
        item.image ? [item.image.path] : [],
      ),
    ),
  ];
  const bucket = supabase.storage.from(ASSETS_BUCKET);
  const replacements = new Map<string, string>();
  for (const path of paths) {
    if (!path.startsWith(`${sourceId}/`))
      throw new Error("Ruta de imagen ajena al estudio");
    const next = `${copyId}/${path.split("/")[1]}`;
    const { error } = await bucket.copy(path, next);
    if (error) throw new Error("No se pudo copiar la imagen");
    replacements.set(path, next);
  }
  return {
    ...config,
    blocks: config.blocks.map((block) =>
      block.kind !== "questions"
        ? block
        : {
            ...block,
            questions: block.questions.map((q) =>
              q.image
                ? {
                    ...q,
                    image: {
                      ...q.image,
                      path: replacements.get(q.image.path)!,
                    },
                  }
                : q,
            ),
          },
    ),
  };
}
