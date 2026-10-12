import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./errors";

const FALLBACK = "No pudimos completar la acción.";

describe("authErrorMessage", () => {
  it("explica en español el límite de correos de Supabase", () => {
    const m = authErrorMessage({ code: "over_email_send_rate_limit", status: 429 }, FALLBACK);
    expect(m).toMatch(/límite de correos/);
    expect(m).not.toMatch(/rate limit/i);
  });

  it("trata cualquier 429 sin código como límite", () => {
    expect(authErrorMessage({ status: 429 }, FALLBACK)).toMatch(/límite de correos/);
  });

  it("avisa cuando el correo no puede enviarse a esa dirección", () => {
    expect(authErrorMessage({ code: "email_address_not_authorized" }, FALLBACK)).toMatch(/no está configurado/);
  });

  it("reconoce cuenta existente y contraseñas débiles o repetidas", () => {
    expect(authErrorMessage({ code: "user_already_exists" }, FALLBACK)).toMatch(/Ya existe una cuenta/);
    expect(authErrorMessage({ code: "email_exists" }, FALLBACK)).toMatch(/Ya existe una cuenta/);
    expect(authErrorMessage({ code: "weak_password" }, FALLBACK)).toMatch(/fácil de adivinar/);
    expect(authErrorMessage({ code: "same_password" }, FALLBACK)).toMatch(/distinta a la anterior/);
  });

  it("lo desconocido cae en el mensaje de respaldo, no en texto del servidor", () => {
    expect(authErrorMessage({ code: "algo_raro", status: 500 }, FALLBACK)).toBe(FALLBACK);
    expect(authErrorMessage({}, FALLBACK)).toBe(FALLBACK);
  });
});
