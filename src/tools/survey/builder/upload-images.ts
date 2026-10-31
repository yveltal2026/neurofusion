"use client";

import { createClient } from "@/lib/supabase/client";
import { ASSETS_BUCKET } from "@/lib/study-files";
import type { SurveyConfig } from "../engine";
import { imageFileError, SURVEY_IMAGE_EXT, type SurveyImage } from "../images";
import {
  discardSurveyImages,
  prepareSurveyImages,
  publishSurveyImages,
} from "./image-actions";
import type { SurveyDraft } from "./model";

export async function createSurveyWithImages(
  projectId: string,
  draft: SurveyDraft,
  config: SurveyConfig,
): Promise<{ studyId?: string; error?: string }> {
  const questions = draft.blocks.flatMap((b) =>
    b.kind === "questions" ? b.questions : [],
  );
  for (const q of questions) {
    if (!q.image) continue;
    const problem = imageFileError(q.image.file);
    if (problem) return { error: problem };
  }
  const input = { projectId, name: draft.name, config };
  const prepared = await prepareSurveyImages(input);
  if (!prepared.studyId)
    return { error: prepared.error ?? "No se pudo preparar la encuesta." };
  const studyId = prepared.studyId;
  try {
    const bucket = createClient().storage.from(ASSETS_BUCKET);
    const images = new Map<string, SurveyImage>();
    const uploaded = new Map<File, string>();
    for (const q of questions) {
      if (!q.image) continue;
      const { file, alt } = q.image;
      let path = uploaded.get(file);
      if (!path) {
        path = `${studyId}/${crypto.randomUUID()}.${SURVEY_IMAGE_EXT[file.type]}`;
        const { error } = await bucket.upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error)
          throw new Error(
            `No se pudo subir la imagen de «${q.prompt}». Vuelve a intentarlo.`,
          );
        uploaded.set(file, path);
      }
      images.set(q.id, { path, alt });
    }
    const withImages: SurveyConfig = {
      ...config,
      blocks: config.blocks.map((b) =>
        b.kind !== "questions"
          ? b
          : {
              ...b,
              questions: b.questions.map((q) =>
                images.has(q.id) ? { ...q, image: images.get(q.id)! } : q,
              ),
            },
      ),
    };
    const result = await publishSurveyImages({
      ...input,
      studyId,
      config: withImages,
    });
    if (result.error || !result.studyId)
      throw new Error(result.error ?? "No se pudo publicar la encuesta.");
    return result;
  } catch (error) {
    // El borrador local (incluidos los archivos) queda disponible para reintentar.
    await discardSurveyImages(studyId).catch(() => {});
    return {
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las imágenes. Vuelve a intentarlo.",
    };
  }
}
