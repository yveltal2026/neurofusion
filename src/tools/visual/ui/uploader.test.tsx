// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetUploader } from "./uploader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  registerAsset: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}));

afterEach(cleanup);

describe("AssetUploader · requisito de formato previo", () => {
  it("con withPlacement=true, no permite elegir ni subir imágenes hasta seleccionar el formato", async () => {
    const user = userEvent.setup();
    render(<AssetUploader studyId="test-study" withPlacement />);

    // El selector de formato se presenta como paso 1
    const formatSelect = screen.getByRole("combobox", { name: /1\. Formato de las piezas/ });
    expect(formatSelect).toBeTruthy();

    // El botón y el input de subir están deshabilitados antes de elegir formato
    const uploadBtn = screen.getByRole("button", { name: "Subir" }) as HTMLButtonElement;
    expect(uploadBtn.disabled).toBe(true);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    // Mensaje explicativo visible
    expect(screen.getByText(/Elige primero el formato/)).toBeTruthy();

    // Al elegir un formato (p. ej. un formato impreso)
    await user.selectOptions(formatSelect, "print_poster_18x24");

    // Ahora el selector de archivos se habilita
    expect(fileInput.disabled).toBe(false);

    // Se muestra la pista con especificaciones del formato elegido
    expect(screen.getByText(/Impresos · mínimo 150 ppp/)).toBeTruthy();
  });

  it("con withPlacement=false (p. ej. eye tracking), el selector de archivos está disponible directo", () => {
    render(<AssetUploader studyId="test-study" withPlacement={false} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(false);
  });
});
