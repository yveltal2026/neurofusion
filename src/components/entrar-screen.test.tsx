// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntrarScreen } from "./entrar-screen";

vi.mock("@/lib/auth/actions", () => ({
  signIn: vi.fn(async () => ({})),
  signUp: vi.fn(async () => ({})),
  requestPasswordReset: vi.fn(async () => ({
    message: "Si hay una cuenta con ese correo, te enviamos un enlace.",
  })),
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
    expect(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" })).toBeTruthy();

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
    expect(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" })).toBeTruthy();
  });

  it("permite abrir el formulario para restablecer la contraseña y volver a entrar", async () => {
    const user = userEvent.setup();
    render(<EntrarScreen />);

    await user.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));

    expect(screen.getByRole("heading", { name: "Restablecer contraseña" })).toBeTruthy();
    expect(screen.getByLabelText("Correo institucional o de trabajo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace de recuperación" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Volver a entrar" }));
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeTruthy();
  });

  it("muestra el aviso cuando la contraseña se actualizó correctamente", () => {
    render(<EntrarScreen resetOk />);

    expect(
      screen.getByText("Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión."),
    ).toBeTruthy();
  });
});
