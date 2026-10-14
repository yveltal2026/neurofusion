// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBattery = vi.fn();
vi.mock("../actions", () => ({
  createBattery: (...a: unknown[]) => createBattery(...a),
}));

import { BatteryBuilder } from "./BatteryBuilder";
import type { AvailableStudy } from "./StepsEditor";

const available: AvailableStudy[] = [
  { studyId: "iat-1", toolType: "iat", name: "IAT café" },
  { studyId: "sv-1", toolType: "survey", name: "Encuesta de marca" },
];

beforeEach(() => createBattery.mockReset());
afterEach(cleanup);

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre de la batería"), "Piloto café");
  await user.type(
    screen.getByLabelText("Título para el participante"),
    "Café y marca",
  );
}

async function addStep(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.selectOptions(
    screen.getByLabelText("Agregar paso"),
    screen.getByRole("option", { name: new RegExp(label) }),
  );
  await user.click(screen.getByRole("button", { name: "Agregar" }));
}

describe("BatteryBuilder", () => {
  it("no envía nada y explica qué falta cuando el formulario está incompleto", async () => {
    const user = userEvent.setup();
    render(
      <BatteryBuilder
        projectId="p"
        projectName="Proyecto"
        available={available}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Crear batería y generar liga" }),
    );
    expect(createBattery).not.toHaveBeenCalled();
    expect(screen.getByText("Revisa lo siguiente:")).toBeTruthy();
    expect(screen.getByText("Escribe un nombre para la batería")).toBeTruthy();
  });

  it("el consentimiento sigue al título mientras nadie lo edite a mano, y deja de seguirlo después", async () => {
    const user = userEvent.setup();
    render(
      <BatteryBuilder
        projectId="p"
        projectName="Proyecto"
        available={available}
      />,
    );
    const consent = screen.getByLabelText(
      "Consentimiento",
    ) as HTMLTextAreaElement;
    await user.type(
      screen.getByLabelText("Título para el participante"),
      "Café y marca",
    );
    expect(consent.value).toContain("Café y marca");

    await user.type(consent, " EXTRA");
    await user.type(screen.getByLabelText("Título para el participante"), " 2");
    expect(consent.value).toContain("EXTRA");
    expect(consent.value).not.toContain("Café y marca 2");
  });

  it("envía el payload con los pasos en el orden sugerido y el estado de cada uno", async () => {
    createBattery.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <BatteryBuilder
        projectId="p-1"
        projectName="Proyecto"
        available={available}
      />,
    );
    await fill(user);
    await addStep(user, "Encuesta de marca");
    await addStep(user, "IAT café");
    await user.click(
      screen.getByRole("checkbox", { name: "Activo: Encuesta de marca" }),
    ); // se omite
    await user.click(
      screen.getByRole("button", { name: "Crear batería y generar liga" }),
    );

    await waitFor(() => expect(createBattery).toHaveBeenCalledTimes(1));
    const arg = createBattery.mock.calls[0]![0];
    expect(arg.projectId).toBe("p-1");
    expect(arg.name).toBe("Piloto café");
    expect(arg.config.title).toBe("Café y marca");
    expect(arg.steps).toEqual([
      { studyId: "iat-1", enabled: true },
      { studyId: "sv-1", enabled: false },
    ]);
  });

  it("muestra el error del servidor sin perder lo capturado", async () => {
    createBattery.mockResolvedValue({ error: "No se pudo crear la batería" });
    const user = userEvent.setup();
    render(
      <BatteryBuilder
        projectId="p"
        projectName="Proyecto"
        available={available}
      />,
    );
    await fill(user);
    await addStep(user, "IAT café");
    await user.click(
      screen.getByRole("button", { name: "Crear batería y generar liga" }),
    );
    expect(await screen.findByText("No se pudo crear la batería")).toBeTruthy();
    expect(
      (screen.getByLabelText("Nombre de la batería") as HTMLInputElement).value,
    ).toBe("Piloto café");
  });
});
