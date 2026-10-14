// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticipantError } from "./participant-error";

afterEach(cleanup);

describe("ParticipantError", () => {
  it("explica sin jerga, ofrece reintentar y muestra el código si existe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<ParticipantError error={err} retry={retry} />);
    expect(
      screen.getByRole("heading", { name: "No pudimos cargar esta página" }),
    ).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.queryByText(/investigador|soporte|stack/i)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Intentar de nuevo" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("sin código no deja una frase rota", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ParticipantError error={new Error("x")} retry={() => {}} />);
    expect(screen.queryByText(/código/)).toBeNull();
  });
});
