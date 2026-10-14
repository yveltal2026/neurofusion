// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { buildParticipantSchema } from "../participant";
import { ParticipantForm } from "./ParticipantForm";

const config: IatConfig = {
  ...defaultIatConfig(),
  conceptA: { label: "Marca A", stimuli: ["Marca A"] },
  conceptB: { label: "Marca B", stimuli: ["Marca B"] },
  texts: { consent: defaultConsentText("café"), thankYou: "Gracias" },
  participant: {
    collectAge: false,
    collectGender: false,
    explicitQuestion: "¿Cuál prefieres?",
    extraFields: [
      { id: "canales", label: "¿Dónde compras?", type: "multiselect", options: ["Tienda", "En línea", "Cafetería"], required: true },
      { id: "valor", label: "Vale lo que cuesta", type: "likert", points: 5, minLabel: "Totalmente en desacuerdo", maxLabel: "Totalmente de acuerdo", required: true },
      { id: "recompra", label: "Volvería a comprar", type: "likert", points: 7, required: false },
    ],
  },
};

afterEach(cleanup);

const scale = (name: string) => within(screen.getByRole("group", { name }));

function setup() {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<ParticipantForm config={config} submitting={false} error={null} onSubmit={onSubmit} />);
  return { user, onSubmit };
}

describe("ParticipantForm · opción múltiple y Likert", () => {
  it("permite marcar varias opciones y elegir un valor de la escala; el payload pasa el esquema del servidor", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("checkbox", { name: "Tienda" }));
    await user.click(screen.getByRole("checkbox", { name: "Cafetería" }));
    await user.click(scale("Vale lo que cuesta").getByRole("radio", { name: "4" }));
    await user.click(screen.getByRole("radio", { name: /Marca B/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toEqual({ explicit: "B", canales: ["Tienda", "Cafetería"], valor: 4 });
    expect(buildParticipantSchema(config).safeParse(payload).success).toBe(true);
  });

  it("al desmarcar una opción la quita de la lista", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("checkbox", { name: "Tienda" }));
    await user.click(screen.getByRole("checkbox", { name: "En línea" }));
    await user.click(screen.getByRole("checkbox", { name: "Tienda" }));
    await user.click(scale("Vale lo que cuesta").getByRole("radio", { name: "5 (Totalmente de acuerdo)" }));
    await user.click(screen.getByRole("radio", { name: /Marca A/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ canales: ["En línea"], valor: 5 });
  });

  it("bloquea el envío si faltan las respuestas obligatorias y no llama a onSubmit", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("radio", { name: /Marca A/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Elige al menos una opción|Elige un valor de la escala|Campo obligatorio/).length).toBeGreaterThanOrEqual(2);
  });

  it("muestra las etiquetas de los extremos de la escala", () => {
    setup();
    expect(screen.getByText(/1 = Totalmente en desacuerdo/)).toBeTruthy();
    expect(screen.getByText(/5 = Totalmente de acuerdo/)).toBeTruthy();
  });
});
