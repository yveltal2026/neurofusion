// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const imageCreate = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ createSurveyStudy: create }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./upload-images", () => ({ createSurveyWithImages: imageCreate }));

import { surveyConfigSchema } from "../engine";
import { SurveyBuilder } from "./SurveyBuilder";

const PROJECT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(undefined);
  imageCreate.mockReset();
  push.mockReset();
});
afterEach(cleanup);

function setup() {
  const user = userEvent.setup();
  render(<SurveyBuilder projectId={PROJECT} projectName="Mi proyecto" />);
  return user;
}

const pickTemplate = (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp | string,
) => user.click(screen.getByRole("button", { name }));

const CREATE = { name: "Crear encuesta y generar liga" };

describe("SurveyBuilder", () => {
  it("publica una pregunta con imagen mediante la subida verificada y conserva su archivo", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    imageCreate.mockResolvedValue({ studyId: "study-images" });
    const user = setup();
    await pickTemplate(user, /Usabilidad/);
    await user.click(screen.getByRole("button", { name: /Editar pregunta 1/ }));
    const file = new File(["png"], "producto.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Agregar imagen"), file);
    await user.click(screen.getByRole("button", CREATE));
    await waitFor(() => expect(imageCreate).toHaveBeenCalledTimes(1));
    expect(create).not.toHaveBeenCalled();
    const draft = imageCreate.mock.calls[0]![1];
    const question = draft.blocks.find((b: { kind: string }) => b.kind === "questions").questions[0];
    expect(question.image.file).toBe(file);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/studies/study-images?created=1"));
  });
  it("ofrece plantillas y, al elegir una, muestra sus bloques editables", async () => {
    const user = setup();
    expect(screen.getByText(/Proyecto: Mi proyecto/)).toBeTruthy();
    for (const t of [
      "En blanco",
      "Usabilidad de un sitio o app",
      "Percepción de una marca o anuncio",
      "Reacción emocional ante un estímulo",
    ]) {
      expect(screen.getByRole("button", { name: t })).toBeTruthy();
    }
    await pickTemplate(user, /Usabilidad/);
    expect(
      screen.getByRole("heading", {
        name: /Bloque 1 · Escala de Usabilidad del Sistema/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Bloque 2 · Net Promoter Score/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Bloque 3 · Preguntas/ }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Título para el participante") as HTMLInputElement)
        .value,
    ).toBe("Usabilidad");
  });

  it("crea la encuesta con una configuración que el motor valida", async () => {
    const user = setup();
    await pickTemplate(user, /Usabilidad/);
    // La plantilla propone un nombre (su título); se puede reemplazar.
    const nameField = screen.getByLabelText(/Nombre del estudio/);
    expect((nameField as HTMLInputElement).value).toBe("Usabilidad");
    await user.clear(nameField);
    await user.type(nameField, "Cliente X – SUS");
    const subject = screen.getAllByLabelText(/Sobre qué se pregunta/)[0]!;
    await user.type(subject, "esta tienda en línea");
    await user.click(screen.getByRole("button", CREATE));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const arg = create.mock.calls[0]![0] as {
      projectId: string;
      name: string;
      config: unknown;
    };
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.name).toBe("Cliente X – SUS");
    const parsed = surveyConfigSchema.safeParse(arg.config);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.blocks.map((b) => b.id)).toEqual([
        "sus",
        "nps",
        expect.stringMatching(/^b/),
      ]);
      expect(parsed.data.blocks[0]).toMatchObject({
        kind: "instrument",
        instrumentId: "sus",
        subject: "esta tienda en línea",
      });
    }
  });

  it("pide el nombre del estudio y no llama al servidor", async () => {
    const user = setup();
    await pickTemplate(user, /Usabilidad/);
    await user.clear(screen.getByLabelText(/Nombre del estudio/));
    await user.click(screen.getByRole("button", CREATE));
    expect(
      await screen.findByRole("button", {
        name: "Escribe un nombre para el estudio",
      }),
    ).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("la plantilla en blanco no se puede crear sin bloques", async () => {
    const user = setup();
    await pickTemplate(user, "En blanco");
    await user.type(screen.getByLabelText(/Nombre del estudio/), "Vacía");
    await user.type(
      screen.getByLabelText("Título para el participante"),
      "Algo",
    );
    await user.click(screen.getByRole("button", CREATE));
    expect(
      await screen.findByRole("button", { name: /al menos un bloque/ }),
    ).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("un enunciado vacío se reporta con su ubicación (bloque y pregunta)", async () => {
    const user = setup();
    await pickTemplate(user, "En blanco");
    await user.type(screen.getByLabelText(/Nombre del estudio/), "Mi estudio");
    await user.type(
      screen.getByLabelText("Título para el participante"),
      "Título",
    );
    // La pantalla vacía enseña el primer paso: preguntas propias arranca con una pregunta lista.
    await user.click(screen.getByRole("button", { name: "Preguntas propias" }));
    expect(
      (screen.getByRole("textbox", { name: "Opción 1" }) as HTMLInputElement)
        .value,
    ).toBe("Opción 1");
    await user.click(screen.getByRole("button", CREATE));
    expect(
      await screen.findByRole("button", { name: /Bloque 1 · pregunta 1: / }),
    ).toBeTruthy();
    expect(create).not.toHaveBeenCalled();

    // El error también aparece junto a la pregunta y desaparece al corregirlo.
    expect(screen.getAllByText("Campo obligatorio").length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("Enunciado"), "¿Qué tal?");
    expect(screen.queryByText(/Falta corregir/)).toBeNull();
    await user.click(screen.getByRole("button", CREATE));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it("agrega una pregunta de un clic, edita opciones con Enter y duplica", async () => {
    const user = setup();
    await pickTemplate(user, "En blanco");
    await user.click(screen.getByRole("button", { name: "Preguntas propias" }));
    await user.type(screen.getByLabelText("Enunciado"), "¿Cuál prefieres?");
    // Enter en la última opción agrega otra debajo y le da el foco.
    await user.click(screen.getByRole("textbox", { name: "Opción 2" }));
    await user.keyboard("{Enter}Tercera");
    expect(
      (screen.getByRole("textbox", { name: "Opción 3" }) as HTMLInputElement)
        .value,
    ).toBe("Tercera");
    // Retroceso en una opción vacía la quita.
    await user.click(screen.getByRole("button", { name: "Agregar opción" }));
    await user.keyboard("{Backspace}");
    expect(screen.queryByRole("textbox", { name: "Opción 4" })).toBeNull();

    // Agregar de un clic una escala: queda activa y la anterior se ve como vista previa.
    await user.click(screen.getByRole("button", { name: "Escala (Likert)" }));
    expect(screen.getAllByLabelText("Enunciado")).toHaveLength(1);
    expect(screen.getByText("¿Cuál prefieres?")).toBeTruthy();
    expect(screen.getByLabelText("Puntos de la escala")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Duplicar pregunta 2" }),
    );
    expect(
      screen.getByRole("button", { name: "Quitar pregunta 3" }),
    ).toBeTruthy();
  });

  it("al cambiar el tipo conserva el enunciado y quitar se puede deshacer", async () => {
    const user = setup();
    await pickTemplate(user, "En blanco");
    await user.click(screen.getByRole("button", { name: "Preguntas propias" }));
    await user.type(screen.getByLabelText("Enunciado"), "¿Cómo te fue?");
    await user.selectOptions(
      screen.getByLabelText("Tipo de pregunta"),
      "Texto libre",
    );
    expect((screen.getByLabelText("Enunciado") as HTMLInputElement).value).toBe(
      "¿Cómo te fue?",
    );
    await user.click(screen.getByRole("button", { name: "Quitar pregunta 1" }));
    expect(screen.queryByLabelText("Enunciado")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect((screen.getByLabelText("Enunciado") as HTMLInputElement).value).toBe(
      "¿Cómo te fue?",
    );
  });

  it("reordena y quita bloques", async () => {
    const user = setup();
    await pickTemplate(user, /Percepción de una marca/);
    const titles = () =>
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent ?? "")
        .filter((t) => t.startsWith("Bloque"));
    expect(titles()[0]).toMatch(/Bloque 1 · Actitud/);
    expect(titles()[2]).toMatch(/Bloque 3 · Net Promoter Score/);

    await user.click(screen.getByRole("button", { name: "Bajar bloque 1" }));
    expect(titles()[0]).toMatch(/Bloque 1 · Intención de compra/);
    expect(titles()[1]).toMatch(/Bloque 2 · Actitud/);
    expect(
      (
        screen.getByRole("button", {
          name: "Subir bloque 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Quitar bloque 1" }));
    expect(titles()).toHaveLength(2);
    expect(titles()[0]).toMatch(/Bloque 1 · Actitud/);
  });

  it("muestra los textos exactos que verá el participante, con el sujeto sustituido", async () => {
    const user = setup();
    await pickTemplate(user, /Usabilidad/);
    const first = screen.getAllByLabelText(/Sobre qué se pregunta/)[0]!;
    await user.type(first, "esta app");
    const block = screen.getByRole("region", { name: /Bloque 1/ });
    // Sin desplegables: la vista previa ya lista los 10 textos.
    expect(within(block).queryByText(/Ver los 10 textos/)).toBeNull();
    expect(
      within(block).getByText("Me pareció fácil usar esta app."),
    ).toBeTruthy();
  });

  it("el consentimiento sigue al título hasta que se edita a mano", async () => {
    const user = setup();
    await pickTemplate(user, "En blanco");
    const title = screen.getByLabelText("Título para el participante");
    await user.click(
      screen.getByRole("button", { name: "Editar consentimiento" }),
    );
    const consent = screen.getByLabelText(
      "Consentimiento",
    ) as HTMLTextAreaElement;
    await user.type(title, "Café");
    expect(consent.value).toContain("«Café»");
    expect(consent.value).toContain("confidencial");
    await user.clear(consent);
    await user.type(consent, "Mi texto");
    await user.type(title, " nuevo");
    expect(consent.value).toBe("Mi texto");
  });

  it("muestra el error del servidor y deja volver a intentar", async () => {
    create.mockResolvedValue({
      error: "No se pudo crear la encuesta. Verifica que el proyecto exista.",
    });
    const user = setup();
    await pickTemplate(user, /Usabilidad/);
    await user.type(screen.getByLabelText(/Nombre del estudio/), " X");
    await user.click(screen.getByRole("button", CREATE));
    expect(
      await screen.findByText(/No se pudo crear la encuesta/),
    ).toBeTruthy();
    expect(
      (
        await screen.findByRole("button", {
          name: "Crear encuesta y generar liga",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("avisa cuando el participante no sabría de qué se trata o qué significa una escala", async () => {
    const user = setup();
    await pickTemplate(user, /Percepción de una marca/);
    // Sin «sobre qué se pregunta», cada instrumento avisa; al escribirlo, el aviso se va.
    expect(
      screen.getAllByText(/Dile al participante de qué se trata/),
    ).toHaveLength(3);
    await user.type(
      screen.getAllByLabelText(/Sobre qué se pregunta/)[0]!,
      "Nespresso",
    );
    expect(
      screen.getAllByText(/Dile al participante de qué se trata/),
    ).toHaveLength(2);

    // Una escala sin etiquetas avisa; la nueva ya trae etiquetas.
    await user.click(
      screen.getAllByRole("button", { name: "Agregar bloque" })[0]!,
    );
    await user.click(screen.getByRole("button", { name: "Preguntas propias" }));
    await user.selectOptions(
      screen.getByLabelText("Tipo de pregunta"),
      "Escala (Likert)",
    );
    expect(
      screen.queryByText(/Sin etiquetas, el participante verá sólo números/),
    ).toBeNull();
    await user.clear(screen.getByLabelText("Etiqueta del extremo bajo"));
    await user.clear(screen.getByLabelText("Etiqueta del extremo alto"));
    expect(
      screen.getByText(/Sin etiquetas, el participante verá sólo números/),
    ).toBeTruthy();
  });
});
