// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntrarScreen } from "./entrar-screen";

vi.mock("@/lib/auth/actions", () => ({
  signIn: vi.fn(async () => ({})),
  signUp: vi.fn(async () => ({})),
}));

describe("EntrarScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("muestra la pantalla principal de acceso sin menú inferior, sin sección de alumno y sin Google", () => {
    render(<EntrarScreen />);

    expect(screen.getByText("aesteros")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByLabelText("Correo institucional o de trabajo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear nuevo usuario" })).toBeTruthy();

    expect(screen.getByTestId("heatmap-hotspot")).toBeTruthy();
    expect(screen.getByTestId("heatmap-trail")).toBeTruthy();

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText(/código de grupo/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Google/i })).toBeNull();
  });

  it("permite alternar al formulario para generar un nuevo usuario", async () => {
    const user = userEvent.setup();
    render(<EntrarScreen />);

    await user.click(screen.getByRole("button", { name: "Crear nuevo usuario" }));

    expect(screen.getByRole("heading", { name: "Crear cuenta" })).toBeTruthy();
    expect(screen.getByLabelText("Nombre completo")).toBeTruthy();
    expect(screen.getByLabelText("Correo institucional o de trabajo")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeTruthy();
  });

  it("avanza al paso de contraseña al ingresar un correo válido", async () => {
    const user = userEvent.setup();
    render(<EntrarScreen />);

    await user.type(
      screen.getByLabelText("Correo institucional o de trabajo"),
      "ana@aesteros.com",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("ana@aesteros.com")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });
});
