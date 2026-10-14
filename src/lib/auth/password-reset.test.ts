import { describe, expect, it } from "vitest";
import { newPasswordSchema, resetRequestSchema } from "./password-reset";

describe("resetRequestSchema", () => {
  it("acepta un correo y le quita espacios", () => {
    expect(resetRequestSchema.parse({ email: "  ana@frsko.com " }).email).toBe("ana@frsko.com");
  });

  it("rechaza correos inválidos o vacíos", () => {
    expect(resetRequestSchema.safeParse({ email: "no-es-correo" }).success).toBe(false);
    expect(resetRequestSchema.safeParse({ email: "" }).success).toBe(false);
    expect(resetRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("acepta una contraseña válida confirmada", () => {
    expect(newPasswordSchema.safeParse({ password: "clave-segura-1", confirm: "clave-segura-1" }).success).toBe(true);
  });

  it("exige mínimo 8 caracteres", () => {
    const r = newPasswordSchema.safeParse({ password: "corta", confirm: "corta" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/al menos 8/);
  });

  it("limita a 72 caracteres, el máximo útil de bcrypt", () => {
    const largo = "a".repeat(73);
    expect(newPasswordSchema.safeParse({ password: largo, confirm: largo }).success).toBe(false);
    const justo = "a".repeat(72);
    expect(newPasswordSchema.safeParse({ password: justo, confirm: justo }).success).toBe(true);
  });

  it("rechaza si la confirmación no coincide y lo marca en el campo de confirmación", () => {
    const r = newPasswordSchema.safeParse({ password: "clave-segura-1", confirm: "clave-segura-2" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["confirm"]);
      expect(r.error.issues[0].message).toBe("Las contraseñas no coinciden");
    }
  });
});
