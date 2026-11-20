// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntrarScreen } from "./entrar-screen";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth/actions", () => ({
  signIn: vi.fn(async () => ({})),
  signUp: vi.fn(async () => ({})),
  signInWithGoogle: vi.fn(async () => {}),
}));

describe("EntrarScreen", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockReset();
  });

  it("muestra la pantalla principal de acceso sin menú inferior", () => {
    render(<EntrarScreen />);

    expect(screen.getByText("aesteros")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByLabelText("Correo institucional o de trabajo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear nuevo usuario" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeTruthy();
    expect(screen.getByLabelText("Soy alumno y tengo un código de grupo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unirme" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
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

  it("navega al estudio cuando un alumno ingresa su código de grupo", async () => {
    const user = userEvent.setup();
    render(<EntrarScreen />);

    await user.type(screen.getByLabelText("Soy alumno y tengo un código de grupo"), "grupo-123");
    await user.click(screen.getByRole("button", { name: "Unirme" }));

    expect(pushMock).toHaveBeenCalledWith("/s/grupo-123");
  });
});
