import { describe, expect, it } from "vitest";
import { listItems } from "../engine";
import {
  addInstrumentBlock,
  addQuestion,
  addQuestionsBlock,
  buildConfig,
  changeQuestionType,
  countItems,
  duplicateQuestion,
  emptyDraft,
  joinOptions,
  moveBlock,
  moveItem,
  moveQuestion,
  removeBlock,
  removeQuestion,
  setConsent,
  setTitle,
  splitOptions,
  TEMPLATES,
  updateBlock,
  updateQuestion,
  type DraftBlock,
  type SurveyDraft,
} from "./model";

const questionsOf = (d: SurveyDraft, i: number) =>
  (d.blocks[i] as Extract<DraftBlock, { kind: "questions" }>).questions;

describe("plantillas", () => {
  it.each(TEMPLATES.filter((t) => t.id !== "blank"))(
    "la plantilla «$name» produce una configuración válida",
    (t) => {
      const draft = t.build();
      const built = buildConfig(draft);
      expect(built.ok, JSON.stringify(built)).toBe(true);
      if (built.ok) {
        expect(built.config.title).toBe(draft.title);
        expect(listItems(built.config).length).toBeGreaterThan(0);
      }
    },
  );

  it("la plantilla en blanco no es válida hasta que se arma algo", () => {
    const blank = TEMPLATES.find((t) => t.id === "blank")!.build();
    const built = buildConfig(blank);
    expect(built.ok).toBe(false);
  });

  it("usabilidad incluye SUS y NPS con ids legibles y una pregunta abierta opcional", () => {
    const built = buildConfig(
      TEMPLATES.find((t) => t.id === "usability")!.build(),
    );
    expect(built.ok && built.config.blocks.map((b) => b.id)).toEqual(
      expect.arrayContaining(["sus", "nps"]),
    );
    const items = built.ok ? listItems(built.config) : [];
    expect(items.find((i) => i.type === "text")).toMatchObject({
      required: false,
      label: "¿Qué mejorarías de esta experiencia?",
    });
  });
});

describe("ids", () => {
  it("el id de un instrumento repetido no choca con el primero", () => {
    let d = addInstrumentBlock(emptyDraft(), "nps");
    d = addInstrumentBlock(d, "nps");
    const ids = d.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("nps");
  });

  it("los ids no se reutilizan al borrar", () => {
    let d = addQuestionsBlock(emptyDraft());
    const blockId = d.blocks[0]!.id;
    d = addQuestion(d, blockId, "text");
    const first = questionsOf(d, 0)[0]!.id;
    d = removeQuestion(d, blockId, first);
    d = addQuestion(d, blockId, "text");
    expect(questionsOf(d, 0)[0]!.id).not.toBe(first);
  });
});

describe("edición", () => {
  function sample() {
    let d = setTitle(emptyDraft(), "Mi encuesta");
    d = addQuestionsBlock(d);
    const blockId = d.blocks[0]!.id;
    d = addQuestion(d, blockId, "select");
    d = addQuestion(d, blockId, "likert");
    d = addInstrumentBlock(d, "sus");
    return { d, blockId };
  }

  it("mueve preguntas y bloques sin salirse de rango", () => {
    const { d, blockId } = sample();
    const [a, b] = questionsOf(d, 0).map((q) => q.id);
    expect(
      questionsOf(moveQuestion(d, blockId, a!, 1), 0).map((q) => q.id),
    ).toEqual([b, a]);
    expect(
      questionsOf(moveQuestion(d, blockId, a!, -1), 0).map((q) => q.id),
    ).toEqual([a, b]);
    expect(moveBlock(d, blockId, 1).blocks.map((x) => x.id)).toEqual([
      "sus",
      blockId,
    ]);
    expect(moveBlock(d, blockId, -1).blocks.map((x) => x.id)).toEqual([
      blockId,
      "sus",
    ]);
    expect(moveItem([1, 2, 3], 5, 1)).toEqual([1, 2, 3]);
  });

  it("actualiza y elimina sin tocar lo demás", () => {
    const { d, blockId } = sample();
    const qid = questionsOf(d, 0)[0]!.id;
    const edited = updateQuestion(d, blockId, qid, { prompt: "¿Hola?" });
    expect(questionsOf(edited, 0)[0]!.prompt).toBe("¿Hola?");
    expect(questionsOf(edited, 0)[1]!.prompt).toBe("");
    expect(removeBlock(edited, "sus").blocks).toHaveLength(1);
    expect(
      updateBlock(d, "sus", { subject: "esta app" }).blocks[1],
    ).toMatchObject({ subject: "esta app" });
    // No modifica el borrador original (inmutabilidad).
    expect(questionsOf(d, 0)[0]!.prompt).toBe("");
  });

  it("el consentimiento sigue al título hasta que se edita a mano", () => {
    let d = setTitle(emptyDraft(), "Café");
    expect(d.consent).toContain("«Café»");
    d = setTitle(d, "Té");
    expect(d.consent).toContain("«Té»");
    d = setConsent(d, "Texto propio");
    d = setTitle(d, "Otro");
    expect(d.consent).toBe("Texto propio");
  });
});

describe("conversión a configuración", () => {
  function valid() {
    let d = { ...setTitle(emptyDraft(), "Mi encuesta"), name: "Mi estudio" };
    d = addQuestionsBlock(d);
    const blockId = d.blocks[0]!.id;
    d = addQuestion(d, blockId, "select");
    d = addQuestion(d, blockId, "number");
    d = addQuestion(d, blockId, "likert");
    const [s, n, l] = questionsOf(d, 0).map((q) => q.id) as [
      string,
      string,
      string,
    ];
    d = updateQuestion(d, blockId, s, {
      prompt: "  ¿Frecuencia?  ",
      optionsText: "Semanal\n\n  Mensual  \n",
    });
    d = updateQuestion(d, blockId, n, {
      prompt: "Edad",
      min: "18",
      max: "99",
      required: false,
    });
    d = updateQuestion(d, blockId, l, {
      prompt: "Confianza",
      points: 7,
      minLabel: " Nada ",
      maxLabel: "",
    });
    return { d, blockId, ids: { s, n, l } };
  }

  it("limpia espacios, líneas vacías y vacíos opcionales", () => {
    const { d } = valid();
    const built = buildConfig({ ...d, intro: "   " });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.config.intro).toBeUndefined();
    const items = listItems(built.config);
    expect(items[0]).toMatchObject({
      type: "select",
      label: "¿Frecuencia?",
      options: ["Semanal", "Mensual"],
    });
    expect(items[1]).toMatchObject({
      type: "number",
      min: 18,
      max: 99,
      required: false,
    });
    expect(items[2]).toMatchObject({
      type: "scale",
      min: 1,
      max: 7,
      minLabel: "Nada",
    });
    expect(items[2]).not.toHaveProperty("maxLabel", "");
  });

  it("describe los errores con su ubicación en lenguaje del investigador", () => {
    const { d, blockId, ids } = valid();
    let bad = updateQuestion(d, blockId, ids.s, {
      prompt: "",
      optionsText: "Sí\nsi",
    });
    bad = addInstrumentBlock(bad, "sus");
    bad = setTitle(bad, "   ");
    const built = buildConfig(bad);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Título:/),
        expect.stringMatching(/^Bloque 1 · pregunta 1: /),
      ]),
    );
    expect(built.errors.some((e) => e.includes("repetida"))).toBe(true);
    expect(new Set(built.errors).size).toBe(built.errors.length); // sin duplicados
  });

  it("sin bloques pide agregar al menos uno", () => {
    const built = buildConfig(setTitle(emptyDraft(), "Algo"));
    expect(built.ok).toBe(false);
    expect(!built.ok && built.errors.join(" ")).toMatch(/al menos un bloque/);
  });

  it("opciones múltiples sin suficientes opciones se rechazan", () => {
    const { d, blockId, ids } = valid();
    const built = buildConfig(
      updateQuestion(d, blockId, ids.s, { optionsText: "Sólo una" }),
    );
    expect(built.ok).toBe(false);
  });

  it("un instrumento con sujeto propio lo conserva", () => {
    let d = setTitle(emptyDraft(), "Mi encuesta");
    d = addInstrumentBlock(d, "sus");
    d = updateBlock(d, "sus", { subject: "esta tienda en línea" });
    const built = buildConfig(d);
    expect(built.ok && listItems(built.config)[0]!.label).toContain(
      "esta tienda en línea",
    );
  });
});

describe("edición estilo formulario", () => {
  function oneQuestion() {
    let d = setTitle(emptyDraft(), "Mi encuesta");
    d = addQuestionsBlock(d);
    const blockId = d.blocks[0]!.id;
    d = addQuestion(d, blockId, "text");
    return { d, blockId, qid: questionsOf(d, 0)[0]!.id };
  }

  it("duplica una pregunta justo debajo, con identificador nuevo", () => {
    const { d, blockId, qid } = oneQuestion();
    const d2 = addQuestion(updateQuestion(d, blockId, qid, { prompt: "A" }), blockId, "nps");
    const copy = duplicateQuestion(d2, blockId, qid);
    const qs = questionsOf(copy, 0);
    expect(qs.map((q) => q.prompt)).toEqual(["A", "A", ""]);
    expect(new Set(qs.map((q) => q.id)).size).toBe(3);
    expect(qs[1]!.id).not.toBe(qid);
  });

  it("cambiar a opciones agrega opciones por defecto y conserva las existentes", () => {
    const { d, blockId, qid } = oneQuestion();
    const asSelect = changeQuestionType(
      updateQuestion(d, blockId, qid, { prompt: "¿Cuál?" }),
      blockId,
      qid,
      "select",
    );
    const q = questionsOf(asSelect, 0)[0]!;
    expect(q.type).toBe("select");
    expect(q.prompt).toBe("¿Cuál?");
    expect(q.optionsText).toBe("Opción 1\nOpción 2");
    const edited = updateQuestion(asSelect, blockId, qid, { optionsText: "Rojo\nAzul" });
    const multi = changeQuestionType(edited, blockId, qid, "multiselect");
    expect(questionsOf(multi, 0)[0]!.optionsText).toBe("Rojo\nAzul");
  });

  it("las opciones se editan como lista y conservan las filas vacías mientras se escribe", () => {
    expect(splitOptions("")).toEqual([]);
    expect(splitOptions("A\n")).toEqual(["A", ""]);
    expect(joinOptions(["A", "", "B"])).toBe("A\n\nB");
  });

  it("cuenta bloques y elementos que llevará la encuesta", () => {
    const usability = TEMPLATES.find((t) => t.id === "usability")!.build();
    expect(countItems(usability)).toEqual({ blocks: 3, items: 12 });
    expect(countItems(emptyDraft())).toEqual({ blocks: 0, items: 0 });
  });

  it("los errores indican a qué bloque y pregunta pertenecen", () => {
    const { d, blockId, qid } = oneQuestion();
    const built = buildConfig(d);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.issues).toContainEqual(
      expect.objectContaining({ blockId, questionId: qid }),
    );
    const noTitle = buildConfig(setTitle(d, ""));
    expect(!noTitle.ok && noTitle.issues.some((i) => i.field === "title")).toBe(true);
  });
});
