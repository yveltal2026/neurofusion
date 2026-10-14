// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOrder, type BatteryStep } from "../engine";
import { StepsEditor, type AvailableStudy } from "./StepsEditor";

afterEach(cleanup);

const available: AvailableStudy[] = [
  { studyId: "iat-1", toolType: "iat", name: "IAT café" },
  { studyId: "sv-1", toolType: "survey", name: "Encuesta de marca" },
  { studyId: "sv-2", toolType: "survey", name: "Encuesta de precio" },
];

/** Contenedor con estado, para ver el efecto de las acciones como las vería el investigador. */
function Harness({
  initial = [] as BatteryStep[],
  readOnly = false,
  spy,
}: {
  initial?: BatteryStep[];
  readOnly?: boolean;
  spy?: (s: BatteryStep[]) => void;
}) {
  const [steps, setSteps] = useState(initial);
  return (
    <StepsEditor
      steps={steps}
      available={available}
      readOnly={readOnly}
      onChange={(next) => {
        spy?.(next);
        setSteps(next);
      }}
    />
  );
}

const names = () =>
  screen
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("p")?.textContent ?? "");
const step = (
  studyId: string,
  toolType: "iat" | "survey",
  name: string,
  enabled = true,
): BatteryStep => ({ studyId, toolType, name, enabled });

async function add(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.selectOptions(
    screen.getByLabelText("Agregar paso"),
    screen.getByRole("option", { name: new RegExp(label) }),
  );
  await user.click(screen.getByRole("button", { name: "Agregar" }));
}

describe("StepsEditor · orden sugerido por la plataforma", () => {
  it("al agregar pasos, los acomoda en el orden sugerido (implícito antes que explícito) sin importar cuál se agregó primero", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByText("Aún no hay pasos. Agrega al menos uno."),
    ).toBeTruthy();

    await add(user, "Encuesta de marca");
    await add(user, "IAT café");
    expect(names()).toEqual(["IAT café", "Encuesta de marca"]);
    expect(screen.queryByText(/va antes de/)).toBeNull(); // el orden sugerido no genera aviso
  });

  it("ya no ofrece como opciones los estudios que son pasos", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await add(user, "IAT café");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Encuesta · Encuesta de marca",
      "Encuesta · Encuesta de precio",
    ]);
  });
});

describe("StepsEditor · el investigador manda", () => {
  const initial = [
    step("iat-1", "iat", "IAT café"),
    step("sv-1", "survey", "Encuesta de marca"),
  ];

  it("puede intercambiar pasos y entonces aparece el aviso metodológico, sin bloquear nada", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Bajar paso 1" }));
    expect(names()).toEqual(["Encuesta de marca", "IAT café"]);
    expect(
      screen.getByText(/«Encuesta de marca» va antes de «IAT café»/),
    ).toBeTruthy();
    // Los botones de los extremos están deshabilitados.
    expect(
      (
        screen.getByRole("button", {
          name: "Subir paso 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Bajar paso 2",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("tras reordenar a mano, los pasos nuevos se agregan al final (respeta su decisión)", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Bajar paso 1" })); // encuesta, IAT
    await add(user, "Encuesta de precio");
    expect(names()).toEqual([
      "Encuesta de marca",
      "IAT café",
      "Encuesta de precio",
    ]);
  });

  it("puede omitir un paso: queda en su lugar atenuado y el aviso desaparece porque el participante no lo vive", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Harness
        initial={[
          step("sv-1", "survey", "Encuesta de marca"),
          step("iat-1", "iat", "IAT café"),
        ]}
        spy={spy}
      />,
    );
    expect(screen.getByText(/va antes de/)).toBeTruthy();

    await user.click(
      screen.getByRole("checkbox", { name: "Activo: Encuesta de marca" }),
    );
    expect(screen.queryByText(/va antes de/)).toBeNull();
    expect(names()).toEqual(["Encuesta de marca", "IAT café"]); // conserva su lugar
    expect(
      screen.getByText(/Encuesta · Medida explícita · omitido/),
    ).toBeTruthy();
    expect(runOrder(spy.mock.lastCall![0])).toEqual(["iat-1"]);
  });

  it("puede volver al orden sugerido con un botón que sólo aparece cuando hace falta", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          step("sv-1", "survey", "Encuesta de marca"),
          step("iat-1", "iat", "IAT café"),
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Restaurar orden sugerido" }),
    );
    expect(names()).toEqual(["IAT café", "Encuesta de marca"]);
    expect(
      screen.queryByRole("button", { name: "Restaurar orden sugerido" }),
    ).toBeNull();
    expect(screen.queryByText(/va antes de/)).toBeNull();
  });

  it("puede quitar un paso", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Quitar paso 1" }));
    expect(names()).toEqual(["Encuesta de marca"]);
  });

  it("avisa cuando sólo queda un paso activo", () => {
    render(
      <Harness
        initial={[
          step("iat-1", "iat", "IAT café"),
          step("sv-1", "survey", "Encuesta de marca", false),
        ]}
      />,
    );
    expect(screen.getByText(/Sólo hay un paso activo/)).toBeTruthy();
  });
});

describe("StepsEditor · sólo lectura (batería con participantes)", () => {
  it("muestra el orden y qué está activo sin controles de edición", () => {
    render(
      <Harness
        initial={[
          step("iat-1", "iat", "IAT café"),
          step("sv-1", "survey", "Encuesta de marca", false),
        ]}
        readOnly
      />,
    );
    expect(names()).toEqual(["IAT café", "Encuesta de marca"]);
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.getByText("Omitido")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Agregar paso")).toBeNull();
  });
});
