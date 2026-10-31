import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  publish: vi.fn(),
  discard: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("./image-actions", () => ({
  prepareSurveyImages: mocks.prepare,
  publishSurveyImages: mocks.publish,
  discardSurveyImages: mocks.discard,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: mocks.upload }) } }),
}));
import { createSurveyWithImages } from "./upload-images";
import {
  addQuestion,
  addQuestionsBlock,
  buildConfig,
  duplicateQuestion,
  emptyDraft,
  setTitle,
  updateQuestion,
} from "./model";

const studyId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
function input() {
  let draft = setTitle({ ...emptyDraft(), name: "Producto" }, "Producto");
  draft = addQuestion(addQuestionsBlock(draft), "b1", "text");
  draft = updateQuestion(draft, "b1", "p2", {
    prompt: "¿Qué opinas?",
    image: {
      file: new File(["png"], "producto.png", { type: "image/png" }),
      alt: "Envase azul",
    },
  });
  draft = duplicateQuestion(draft, "b1", "p2");
  const built = buildConfig(draft);
  if (!built.ok) throw new Error("config inválida");
  return { draft, config: built.config };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({ studyId });
  mocks.publish.mockResolvedValue({ studyId });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.discard.mockResolvedValue(undefined);
});

describe("publicación con imágenes", () => {
  it("prepara, sube directo a Storage y publica con rutas; nunca envía File al servidor", async () => {
    const { draft, config } = input();
    expect(await createSurveyWithImages(projectId, draft, config)).toEqual({
      studyId,
    });
    expect(mocks.prepare.mock.calls[0]![0].config).toEqual(config);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0]![0]).toMatch(
      new RegExp(`^${studyId}/.+\\.png$`),
    );
    const published = mocks.publish.mock.calls[0]![0];
    expect(published.config.blocks[0].questions[0].image).toEqual({
      path: mocks.upload.mock.calls[0]![0],
      alt: "Envase azul",
    });
    expect(published.config.blocks[0].questions[1].image).toEqual(
      published.config.blocks[0].questions[0].image,
    );
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it("si falla una subida, no publica, limpia el borrador y conserva los archivos locales", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "network" } });
    const { draft, config } = input();
    expect(
      (await createSurveyWithImages(projectId, draft, config)).error,
    ).toMatch(/subir/);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.discard).toHaveBeenCalledWith(studyId);
    const b = draft.blocks[0]!;
    if (b.kind === "questions")
      expect(b.questions[0]!.image?.file.name).toBe("producto.png");
  });
  it("si el servidor rechaza el contenido, muestra el error y limpia el intento", async () => {
    mocks.publish.mockResolvedValue({ error: "Imagen inválida" });
    const { draft, config } = input();
    expect(await createSurveyWithImages(projectId, draft, config)).toEqual({
      error: "Imagen inválida",
    });
    expect(mocks.discard).toHaveBeenCalledWith(studyId);
  });
  it("no sube nada cuando RLS impide crear el borrador", async () => {
    mocks.prepare.mockResolvedValue({ error: "Proyecto no disponible" });
    const { draft, config } = input();
    expect(await createSurveyWithImages(projectId, draft, config)).toEqual({
      error: "Proyecto no disponible",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
