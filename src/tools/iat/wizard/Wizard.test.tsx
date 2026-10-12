// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iatConfigSchema } from "../config";

const createIatStudy = vi.fn<(input: unknown) => Promise<{ error?: string }>>(async () => ({}));
vi.mock("./actions", () => ({ createIatStudy: (input: unknown) => createIatStudy(input) }));

const suggestIatDesign = vi.fn<(brief: unknown) => Promise<unknown>>();
vi.mock("./ai-actions", () => ({ suggestIatDesign: (brief: unknown) => suggestIatDesign(brief) }));

import { Wizard } from "./Wizard";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function setup() {
  const user = userEvent.setup();
  render(<Wizard projectId={PROJECT_ID} projectName="Proyecto de prueba" aiAvailable />);
  const start = () => user.click(screen.getByRole("button", { name: "Comenzar" }));
  const next = () => user.click(screen.getByRole("button", { name: "Continuar" }));
  const alerts = () => screen.queryAllByRole("alert").map((a) => a.textContent ?? "");
  return { user, start, next, alerts };
}

beforeEach(() => {
  createIatStudy.mockClear();
  suggestIatDesign.mockReset();
});
afterEach(cleanup);

describe("Wizard IAT", () => {
  it("bloquea cada paso hasta que sus datos sean válidos", async () => {
    const { user, start, next, alerts } = setup();
    await start();

    await next();
    expect(alerts().join()).toContain("Escribe el producto, servicio o categoría");

    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café");
    // Al editar, el error obsoleto desaparece solo.
    expect(alerts()).toEqual([]);
    await next();

    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "Marca A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "marca á");
    await next();
    expect(alerts().join()).toContain("Los dos conceptos deben tener nombres distintos");
  });

  it("recorre los 8 pasos y envía una configuración que el servidor aceptaría", async () => {
    const { user, start, next, alerts } = setup();
    await start();

    // 1 · producto
    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café de especialidad");
    await next();

    // 2 · conceptos (con estímulos adicionales en varias líneas)
    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "Marca A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "Marca B");
    await user.type(screen.getByLabelText("Estímulos adicionales del concepto A"), "Café A{Enter}Latte A");
    expect((screen.getByLabelText("Estímulos adicionales del concepto A") as HTMLTextAreaElement).value).toBe("Café A\nLatte A");
    await next();

    // 3 · dimensiones: sin ninguna bloquea; con ejemplos se precargan las palabras
    await next();
    expect(alerts().join()).toContain("Agrega al menos una dimensión");
    await user.click(screen.getByRole("button", { name: "Confiable / Poco confiable" }));
    await user.click(screen.getByRole("button", { name: "Premium / Económico" }));
    expect(alerts()).toEqual([]);
    await next();

    // 4 · palabras
    expect((screen.getByLabelText("Palabras de Confiable") as HTMLTextAreaElement).value).toBe("Seguro\nHonesto\nSólido\nEstable\nFiable");
    await next();

    // 5 · protocolo (clásico por defecto, recomendado)
    expect((screen.getByRole("radio", { name: /protocolo clásico de 7 bloques/i }) as HTMLInputElement).checked).toBe(true);
    await next();

    // 6 · participante: pregunta extra de opción única
    await user.click(screen.getByRole("button", { name: "+ Agregar pregunta" }));
    await user.type(screen.getByLabelText("Pregunta", { selector: "input" }), "¿Con qué frecuencia consumes café?");
    await user.selectOptions(screen.getByLabelText("Tipo de respuesta"), "select");
    await next();
    expect(alerts().join()).toContain("Campo obligatorio"); // opciones aún vacías
    await user.type(screen.getByLabelText("Opciones (una por línea)"), "Diario{Enter}Semanal{Enter}Ocasional");
    await next();

    // 7 · tema neutro (por defecto)
    expect((screen.getByRole("radio", { name: /paleta neutra/i }) as HTMLInputElement).checked).toBe(true);
    await next();

    // 8 · confirmación: nombre y consentimiento precargados
    expect((screen.getByLabelText("Nombre del estudio") as HTMLInputElement).value).toBe("Marca A vs Marca B");
    expect((screen.getByLabelText("Texto de consentimiento informado") as HTMLTextAreaElement).value).toContain("café de especialidad");
    await user.click(screen.getByRole("button", { name: "Generar estudio" }));

    expect(createIatStudy).toHaveBeenCalledTimes(1);
    const payload = createIatStudy.mock.calls[0][0] as { projectId: string; name: string; config: unknown };
    expect(payload.projectId).toBe(PROJECT_ID);
    expect(payload.name).toBe("Marca A vs Marca B");

    // Lo que produce el wizard debe pasar la validación autoritativa del servidor.
    const parsed = iatConfigSchema.safeParse(payload.config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const cfg = parsed.data!;
    expect(cfg.conceptA.stimuli).toEqual(["Marca A", "Café A", "Latte A"]);
    expect(cfg.conceptB.stimuli).toEqual(["Marca B"]);
    expect(cfg.dimensions.map((d) => d.id)).toEqual(["confianza", "posicionamiento"]);
    expect(cfg.participant.extraFields).toMatchObject([{ type: "select", options: ["Diario", "Semanal", "Ocasional"] }]);
    expect(cfg.protocol).toBe("classic7");
  });

  it("muestra el error del servidor si la creación falla", async () => {
    createIatStudy.mockResolvedValueOnce({ error: "No se pudo crear el estudio" });
    const { user, start, next } = setup();
    await start();
    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café");
    await next();
    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "B");
    await next();
    await user.click(screen.getByRole("button", { name: "Bueno / Malo" }));
    await next();
    await next(); // palabras precargadas
    await next(); // protocolo
    await next(); // participante
    await next(); // tema
    await user.click(screen.getByRole("button", { name: "Generar estudio" }));
    const box = await screen.findByText("No se pudo crear el estudio");
    expect(within(box.closest('[role="alert"]') as HTMLElement).getByText("No se pudo crear el estudio")).toBeTruthy();
  });

  it("no deja pasar con palabras insuficientes ni repetidas", async () => {
    const { user, start, next, alerts } = setup();
    await start();
    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café");
    await next();
    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "B");
    await next();
    await user.click(screen.getByRole("button", { name: "Bueno / Malo" }));
    await next();
    const pos = screen.getByLabelText("Palabras de Bueno");
    await user.clear(pos);
    await user.type(pos, "Excelente{Enter}Genial");
    await next();
    expect(alerts().join()).toContain("Mínimo 5 palabras por polo");
  });

  it("permite preguntas de opción múltiple y escalas Likert, y el servidor las acepta", async () => {
    const { user, start, next } = setup();
    await start();
    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café");
    await next();
    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "B");
    await next();
    await user.click(screen.getByRole("button", { name: "Bueno / Malo" }));
    await next();
    await next(); // palabras
    await next(); // protocolo

    // 6 · una opción múltiple con comas dentro de una opción
    await user.click(screen.getByRole("button", { name: "+ Agregar pregunta" }));
    await user.type(screen.getByLabelText("Pregunta", { selector: "input" }), "¿Dónde compras café?");
    await user.selectOptions(screen.getByLabelText("Tipo de respuesta"), "multiselect");
    await user.type(screen.getByLabelText("Opciones (una por línea)"), "Tienda, en línea{Enter}Cafetería{Enter}Supermercado");

    // y una escala Likert de 7 puntos con etiquetas frecuentes
    await user.click(screen.getByRole("button", { name: "+ Agregar escala Likert" }));
    const questions = screen.getAllByLabelText("Pregunta", { selector: "input" });
    await user.type(questions[1], "El café vale lo que cuesta");
    await user.selectOptions(screen.getByLabelText("Puntos de la escala"), "7");
    await user.click(screen.getByRole("button", { name: "Satisfacción" }));
    expect((screen.getByLabelText("Etiqueta del extremo bajo (1)") as HTMLInputElement).value).toBe("Muy insatisfecho");
    expect(screen.getByLabelText("Etiqueta del extremo alto (7)")).toBeTruthy();

    await next(); // participante
    await next(); // tema
    await user.click(screen.getByRole("button", { name: "Generar estudio" }));

    const payload = createIatStudy.mock.calls[0][0] as { config: unknown };
    const parsed = iatConfigSchema.safeParse(payload.config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data!.participant.extraFields).toMatchObject([
      { type: "multiselect", options: ["Tienda, en línea", "Cafetería", "Supermercado"] },
      { type: "likert", points: 7, minLabel: "Muy insatisfecho", maxLabel: "Muy satisfecho", label: "El café vale lo que cuesta" },
    ]);
  });

  it("no deja pasar opciones repetidas en una opción múltiple", async () => {
    const { user, start, next, alerts } = setup();
    await start();
    await user.type(screen.getByLabelText("Producto, servicio o categoría"), "café");
    await next();
    await user.type(screen.getByLabelText("Concepto A (nombre exacto)"), "A");
    await user.type(screen.getByLabelText("Concepto B (nombre exacto)"), "B");
    await next();
    await user.click(screen.getByRole("button", { name: "Bueno / Malo" }));
    await next();
    await next();
    await next();
    await user.click(screen.getByRole("button", { name: "+ Agregar pregunta" }));
    await user.type(screen.getByLabelText("Pregunta", { selector: "input" }), "¿Dónde?");
    await user.selectOptions(screen.getByLabelText("Tipo de respuesta"), "multiselect");
    await user.type(screen.getByLabelText("Opciones (una por línea)"), "Tienda{Enter}tienda");
    await next();
    expect(alerts().join()).toContain("repetida");
  });

  describe("modo asistido por IA", () => {
    const aiPatch = {
      product: "café de especialidad",
      conceptA: { label: "Starbucks", stimuli: ["Starbucks"] },
      conceptB: { label: "Punta del Cielo", stimuli: ["Punta del Cielo"] },
      dimensions: [
        {
          id: "confianza",
          name: "Confianza",
          positiveLabel: "Confiable",
          negativeLabel: "Poco confiable",
          positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
          negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
        },
      ],
    };

    it("rellena producto, conceptos, dimensiones y palabras, y permite editarlos", async () => {
      suggestIatDesign.mockResolvedValue({ ok: true, patch: aiPatch, notes: "Dimensiones elegidas por relevancia." });
      const { user, next } = setup();
      await user.click(screen.getByRole("radio", { name: /asistido por ia/i }));
      const button = screen.getByRole("button", { name: "Sugerir diseño con IA" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true); // descripción demasiado corta
      await user.type(screen.getByLabelText("¿Qué quieres analizar y en qué contexto?"), "Percepción de Starbucks vs Punta del Cielo entre universitarios");
      await user.click(button);

      expect(suggestIatDesign).toHaveBeenCalledWith("Percepción de Starbucks vs Punta del Cielo entre universitarios");
      expect(await screen.findByText(/Propuesta generada por IA/)).toBeTruthy();
      expect(screen.getByText("Dimensiones elegidas por relevancia.")).toBeTruthy();
      expect((screen.getByLabelText("Producto, servicio o categoría") as HTMLInputElement).value).toBe("café de especialidad");

      await next();
      expect((screen.getByLabelText("Concepto A (nombre exacto)") as HTMLInputElement).value).toBe("Starbucks");
      await next();
      expect((screen.getByLabelText("Nombre de la dimensión") as HTMLInputElement).value).toBe("Confianza");
      await next();
      expect((screen.getByLabelText("Palabras de Confiable") as HTMLTextAreaElement).value).toBe("Seguro\nHonesto\nSólido\nEstable\nFiable");
    });

    it("muestra el error de la IA y deja continuar manualmente", async () => {
      suggestIatDesign.mockResolvedValue({ ok: false, error: "La API key de Anthropic no es válida." });
      const { user, start, alerts } = setup();
      await user.click(screen.getByRole("radio", { name: /asistido por ia/i }));
      await user.type(screen.getByLabelText("¿Qué quieres analizar y en qué contexto?"), "Quiero analizar bancos digitales en México");
      await user.click(screen.getByRole("button", { name: "Sugerir diseño con IA" }));
      expect(await screen.findByText("La API key de Anthropic no es válida.")).toBeTruthy();
      expect(alerts()).toHaveLength(1);
      await user.click(screen.getByRole("radio", { name: /capturar todo manualmente/i }));
      await start();
      expect(screen.getByLabelText("Producto, servicio o categoría")).toBeTruthy();
    });
  });
});
