import { z } from "zod";

export const SURVEY_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const MAX_SURVEY_IMAGE_BYTES = 10 * 1024 * 1024;
export const SURVEY_IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Sólo referencias al bucket privado; nunca URLs arbitrarias ni datos base64. */
export const surveyImageSchema = z.object({
  path: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/,
      "Ruta de imagen inválida",
    ),
  alt: z.string().trim().max(300, "Máximo 300 caracteres").default(""),
});
export type SurveyImage = z.infer<typeof surveyImageSchema>;

export function imageFileError(
  file: Pick<File, "type" | "size">,
): string | undefined {
  if (
    !SURVEY_IMAGE_TYPES.includes(
      file.type as (typeof SURVEY_IMAGE_TYPES)[number],
    )
  )
    return "Usa una imagen PNG, JPEG o WebP.";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_SURVEY_IMAGE_BYTES)
    return "La imagen debe pesar como máximo 10 MB.";
}
