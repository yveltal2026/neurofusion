// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QuestionImageEditor } from "./QuestionImageEditor";
import type { DraftQuestion } from "./model";

const revoke = vi.fn();
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = revoke;
  revoke.mockClear();
});
afterEach(cleanup);
function Editor() {
  const [image, setImage] = useState<DraftQuestion["image"]>();
  return <QuestionImageEditor image={image} onChange={setImage} />;
}

describe("imagen de la pregunta", () => {
  it("previsualiza, describe, cambia y quita la imagen, liberando las vistas locales", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const first = new File(["first"], "producto.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Agregar imagen"), first);
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview");
    await user.type(
      screen.getByLabelText("Descripción de la imagen"),
      "Envase azul",
    );
    expect(screen.getByAltText("Envase azul")).toBeTruthy();
    await user.upload(
      screen.getByLabelText("Cambiar imagen"),
      new File(["next"], "otro.jpg", { type: "image/jpeg" }),
    );
    expect(screen.getByAltText("Envase azul")).toBeTruthy();
    expect(revoke).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Quitar imagen" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("Agregar imagen")).toBeTruthy();
  });

  it("rechaza formatos no admitidos y archivos vacíos sin agregar una imagen", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Editor />);
    await user.upload(
      screen.getByLabelText("Agregar imagen"),
      new File(["svg"], "x.svg", { type: "image/svg+xml" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("PNG");
    expect(screen.queryByRole("img")).toBeNull();
    await user.upload(
      screen.getByLabelText("Agregar imagen"),
      new File([], "x.png", { type: "image/png" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("vacío");
  });
});
