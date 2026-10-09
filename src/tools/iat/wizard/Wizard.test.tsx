// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iatConfigSchema } from "../config";

const createIatStudy = vi.fn<(input: unknown) => Promise<{ error?: string }>>(async () => ({}));
vi.mock("./actions", () => ({ createIatStudy: (input: unknown) => createIatStudy(input) }));

import { Wizard } from "./Wizard";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function setup() {
  const user = userEvent.setup();
  render(<Wizard projectId={PROJECT_ID} projectName="Proyecto de prueba" />);
  const next = () => user.click(screen.getByRole("button", { name: "Continuar" }));
  const alerts = () => screen.queryAllByRole("alert").map((a) => a.textContent ?? "");
  return { user, next, alerts };
}

beforeEach(() => createIatStudy.mockClear());
afterEach(cleanup);

describe("Wizard IAT", () => {
  it("bloquea cada paso hasta que sus datos sean válidos", async () => {
    const { user, next, alerts } = setup();

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
    const { user, next, alerts } = setup();

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
    const { user, next } = setup();
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
    const { user, next, alerts } = setup();
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
});
