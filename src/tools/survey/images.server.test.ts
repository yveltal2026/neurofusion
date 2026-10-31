import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { copySurveyImages, verifySurveyImages } from "./images.server";
import { MAX_SURVEY_IMAGE_BYTES } from "./images";
import type { SurveyConfig } from "./engine";

const studyId = "11111111-1111-4111-8111-111111111111";
const copyId = "33333333-3333-4333-8333-333333333333";
const path = `${studyId}/22222222-2222-4222-8222-222222222222.png`;
function config(imagePath = path): SurveyConfig {
  return {
    version: 1,
    title: "Producto",
    texts: { consent: "Acepto", thankYou: "Gracias" },
    blocks: [
      {
        kind: "questions",
        id: "b",
        questions: [
          {
            type: "text",
            id: "q",
            prompt: "Opinión",
            required: true,
            image: { path: imagePath, alt: "Envase" },
          },
        ],
      },
    ],
  };
}
function client(data: Blob | null, copyError: unknown = null) {
  const download = vi.fn(async () => ({ data, error: null }));
  const copy = vi.fn(async () => ({ error: copyError }));
  return {
    download,
    copy,
    supabase: {
      storage: { from: () => ({ download, copy }) },
    } as unknown as SupabaseClient,
  };
}
async function png() {
  return new Blob(
    [
      new Uint8Array(
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "blue" },
        })
          .png()
          .toBuffer(),
      ),
    ],
    { type: "image/png" },
  );
}

describe("verificación de imágenes en el servidor", () => {
  it("acepta una imagen real y comprueba sólo una vez un archivo compartido por preguntas duplicadas", async () => {
    const c = client(await png());
    const survey = config();
    const block = survey.blocks[0]!;
    if (block.kind === "questions")
      block.questions.push({ ...block.questions[0]!, id: "q2" });
    expect(
      await verifySurveyImages(c.supabase, studyId, survey),
    ).toBeUndefined();
    expect(c.download).toHaveBeenCalledTimes(1);
  });
  it("rechaza referencias a otro estudio antes de descargar", async () => {
    const c = client(await png());
    expect(await verifySurveyImages(c.supabase, copyId, config())).toMatch(
      /pertenece/,
    );
    expect(c.download).not.toHaveBeenCalled();
  });
  it("rechaza archivos ausentes, vacíos y demasiado grandes", async () => {
    expect(
      await verifySurveyImages(client(null).supabase, studyId, config()),
    ).toMatch(/leer/);
    expect(
      await verifySurveyImages(
        client(new Blob([])).supabase,
        studyId,
        config(),
      ),
    ).toMatch(/10 MB/);
    const oversized = {
      size: MAX_SURVEY_IMAGE_BYTES + 1,
      arrayBuffer: vi.fn(),
    } as unknown as Blob;
    expect(
      await verifySurveyImages(client(oversized).supabase, studyId, config()),
    ).toMatch(/10 MB/);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });
  it("rechaza contenido falso, SVG y extensiones que no corresponden al formato real", async () => {
    expect(
      await verifySurveyImages(
        client(new Blob(["fake png"])).supabase,
        studyId,
        config(),
      ),
    ).toMatch(/válido/);
    const svg = new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
    ]);
    expect(
      await verifySurveyImages(client(svg).supabase, studyId, config()),
    ).toMatch(/válida/);
    expect(
      await verifySurveyImages(
        client(await png()).supabase,
        studyId,
        config(path.replace(".png", ".jpg")),
      ),
    ).toMatch(/válida/);
  });
  it("copia los objetos a la carpeta del nuevo estudio sin modificar el original", async () => {
    const c = client(null);
    const original = config();
    const copy = await copySurveyImages(c.supabase, studyId, copyId, original);
    expect(c.copy).toHaveBeenCalledWith(path, path.replace(studyId, copyId));
    expect(JSON.stringify(copy)).toContain(copyId);
    expect(JSON.stringify(copy)).not.toContain(studyId);
    expect(JSON.stringify(original)).toContain(studyId);
  });
  it("no devuelve una copia con referencias rotas si Storage rechaza la copia", async () => {
    await expect(
      copySurveyImages(
        client(null, new Error("RLS")).supabase,
        studyId,
        copyId,
        config(),
      ),
    ).rejects.toThrow(/copiar/);
  });
});
