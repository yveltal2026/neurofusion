// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EyeAoiEditor } from "./aoi-editor";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("../aoi-actions", () => ({ saveEyeAois: mocks.save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("permite definir una AOI con teclado, editarla y guardarla sin campos de estimación de IA", async () => {
  mocks.save.mockResolvedValue({ ok: true });
  render(
    <EyeAoiEditor
      studyId="study"
      assetId="asset"
      imageUrl="/test.png"
      width={1000}
      height={500}
      initial={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar área" }));
  fireEvent.change(screen.getByLabelText("Etiqueta"), {
    target: { value: "Precio" },
  });
  fireEvent.change(screen.getByLabelText("Tipo"), {
    target: { value: "price" },
  });
  fireEvent.change(screen.getByLabelText("Izquierda (%)"), {
    target: { value: "10" },
  });
  expect(screen.queryByText(/Atracción visual/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Guardar áreas" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      studyId: "study",
      assetId: "asset",
      aois: [
        expect.objectContaining({
          label: "Precio",
          kind: "price",
          box: [0.1, 0.25, 0.75, 0.75],
        }),
      ],
    }),
  );
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("conserva la edición si falla el guardado y permite eliminar áreas", async () => {
  mocks.save.mockResolvedValue({ error: "Error de guardado" });
  render(
    <EyeAoiEditor
      studyId="study"
      assetId="asset"
      imageUrl="/test.png"
      width={1000}
      height={500}
      initial={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar área" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar áreas" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Error de guardado"),
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Eliminar área" }));
  expect(screen.queryByLabelText("Etiqueta")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Guardar áreas" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
