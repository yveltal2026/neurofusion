import { describe, expect, it } from "vitest";
import {
  buildAnswerSchema,
  groupBipolar,
  listItems,
  questionSchema,
  scoreSurvey,
  surveyConfigSchema,
  type SurveyConfig,
  type SurveyQuestion,
} from "./engine";
import {
  imageFileError,
  MAX_SURVEY_IMAGE_BYTES,
  surveyImageSchema,
} from "./images";
import {
  addQuestion,
  addQuestionsBlock,
  buildConfig,
  changeQuestionType,
  duplicateQuestion,
  emptyDraft,
  setTitle,
  updateQuestion,
} from "./builder/model";

const image = {
  path: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
  alt: "Envase del producto",
};
const types: SurveyQuestion[] = [
  {
    id: "q",
    type: "select",
    prompt: "¿Lo comprarías?",
    required: true,
    options: ["Sí", "No"],
  },
  {
    id: "q",
    type: "multiselect",
    prompt: "¿Qué te gusta?",
    required: true,
    options: ["Color", "Forma"],
  },
  {
    id: "q",
    type: "likert",
    prompt: "¿Te gusta?",
    required: true,
    points: 5,
    minLabel: "Poco",
    maxLabel: "Mucho",
  },
  { id: "q", type: "text", prompt: "¿Qué opinas?", required: true },
  { id: "q", type: "number", prompt: "¿Cuánto pagarías?", required: true },
  { id: "q", type: "nps", prompt: "¿Lo recomendarías?", required: true },
];
function config(question: SurveyQuestion): SurveyConfig {
  return surveyConfigSchema.parse({
    version: 1,
    title: "Producto",
    texts: { consent: "Acepto", thankYou: "Gracias" },
    blocks: [{ kind: "questions", id: "b", questions: [question] }],
  });
}

describe("imágenes de encuesta", () => {
  it.each(types)(
    "acepta imágenes en $type sin cambiar la validación ni puntuación de respuestas",
    (question) => {
      const before = config(question);
      const after = config({ ...question, image });
      expect(listItems(after)[0]!.image).toEqual(image);
      const value =
        question.type === "select"
          ? "Sí"
          : question.type === "multiselect"
            ? ["Color"]
            : question.type === "text"
              ? "Me gusta"
              : 3;
      expect(buildAnswerSchema(after).parse({ q: value })).toEqual(
        buildAnswerSchema(before).parse({ q: value }),
      );
      expect(scoreSurvey(after, { q: value })).toEqual(
        scoreSurvey(before, { q: value }),
      );
      expect(questionSchema.parse(question)).not.toHaveProperty("image");
    },
  );

  it("rechaza URLs, base64, traversal, SVG y descripciones excesivas", () => {
    for (const path of [
      "https://example.com/a.png",
      "data:image/png;base64,abc",
      "../a.png",
      image.path.replace(".png", ".svg"),
    ])
      expect(surveyImageSchema.safeParse({ ...image, path }).success).toBe(
        false,
      );
    expect(
      surveyImageSchema.safeParse({ ...image, alt: "a".repeat(301) }).success,
    ).toBe(false);
  });

  it("valida tipo y tamaño del archivo sin rechazar el límite permitido", () => {
    expect(
      imageFileError({ type: "image/png", size: MAX_SURVEY_IMAGE_BYTES }),
    ).toBeUndefined();
    expect(
      imageFileError({ type: "image/png", size: MAX_SURVEY_IMAGE_BYTES + 1 }),
    ).toMatch(/10 MB/);
    expect(imageFileError({ type: "image/svg+xml", size: 20 })).toMatch(/PNG/);
    expect(imageFileError({ type: "image/png", size: 0 })).toMatch(/vacío/);
  });

  it("conserva el archivo y descripción al cambiar de tipo y duplicar; no serializa archivos", () => {
    const file = new File(["image"], "producto.png", { type: "image/png" });
    let draft = setTitle({ ...emptyDraft(), name: "Producto" }, "Producto");
    draft = addQuestion(addQuestionsBlock(draft), "b1", "select");
    draft = updateQuestion(draft, "b1", "p2", {
      prompt: "¿Lo comprarías?",
      image: { file, alt: image.alt },
    });
    draft = changeQuestionType(draft, "b1", "p2", "text");
    draft = duplicateQuestion(draft, "b1", "p2");
    const block = draft.blocks[0]!;
    if (block.kind !== "questions") throw new Error("bloque inesperado");
    expect(block.questions.map((q) => q.image?.file)).toEqual([file, file]);
    expect(block.questions[1]!.image?.alt).toBe(image.alt);
    const built = buildConfig(draft);
    expect(built.ok).toBe(true);
    expect(JSON.stringify(built)).not.toContain("producto.png");
    expect(JSON.stringify(built)).not.toContain("image");
  });

  it("no agrupa escalas con el mismo enunciado que muestran imágenes distintas", () => {
    const [first] = listItems(config({ ...types[2]!, image }));
    expect(first).toBeDefined();
    const second = {
      ...first!,
      id: "other",
      image: { ...image, path: image.path.replace("22222222-", "33333333-") },
    };
    expect(groupBipolar([first!, second])).toHaveLength(2);
    expect(groupBipolar([first!, { ...second, image }])).toHaveLength(1);
    expect(
      groupBipolar([first!, { ...second, image: undefined }]),
    ).toHaveLength(2);
  });
});
