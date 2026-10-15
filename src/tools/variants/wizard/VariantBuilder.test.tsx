// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ createVariantStudy: create }));

import { variantConfigSchema } from "../config";
import { VariantBuilder } from "./VariantBuilder";

const PROJECT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(undefined);
});
afterEach(cleanup);

/** Textos de las tarjetas de variante (los radios de «variante», no los de cuántos conceptos). */
const variantCards = () =>
  screen
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("name") === "variant")
    .map((r) => r.closest("label")?.textContent ?? "");

const setup = () => {
  const user = userEvent.setup();
  render(<VariantBuilder projectId={PROJECT} projectName="Mi proyecto" />);
  return user;
};

describe("VariantBuilder", () => {
  it("con un concepto ofrece las tres variantes; con dos, sólo las que lo admiten", async () => {
    const user = setup();
    expect(variantCards().map((t) => /SC-IAT|Go\/No-Go|Priming/.exec(t)?.[0])).toEqual(["SC-IAT", "Go/No-Go", "Priming"]);
    await user.click(screen.getByRole("radio", { name: /Dos marcas o conceptos/ }));
    expect(variantCards().map((t) => /SC-IAT|Go\/No-Go|Priming/.exec(t)?.[0])).toEqual(["Go/No-Go", "Priming"]);
    expect(screen.getByRole("link", { name: "IAT clásico" })).toBeTruthy();
  });

  it("no avanza si falta el producto y señala el error", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Continuar" })); // diseño → contenido
    await user.click(screen.getByRole("button", { name: "Continuar" })); // contenido sin producto
    expect(screen.getByText("Campo obligatorio")).toBeTruthy();
    expect(screen.getAllByText(/Paso 2 de 5/).length).toBeGreaterThan(0);
  });

  it("recorre los pasos y crea el estudio con una configuración que el servidor acepta", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText(/Producto, servicio o categoría/), "café de especialidad");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/no se han cotejado contra los datos de las publicaciones originales/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText(/Texto de consentimiento/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText("Nombre del estudio")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Generar estudio" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const payload = create.mock.calls[0][0];
    expect(payload.projectId).toBe(PROJECT);
    expect(payload.name).toMatch(/SC-IAT/);
    expect(variantConfigSchema.safeParse(payload.config).success).toBe(true);
    expect(payload.config.variant).toBe("sc_iat");
  });

  it("muestra el error del servidor si no se pudo crear", async () => {
    create.mockResolvedValue({ error: "No se pudo crear el estudio." });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText(/Producto, servicio o categoría/), "café");
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Generar estudio" }));
    expect(await screen.findByText("No se pudo crear el estudio.")).toBeTruthy();
  });
});
