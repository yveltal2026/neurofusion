import { describe, expect, it } from "vitest";
import { originFromUrl, webEyetrackingConfigSchema } from "./config";

describe("webEyetrackingConfigSchema", () => {
  it("acepta estudio en modo live_snippet con pasos válidos", () => {
    const parsed = webEyetrackingConfigSchema.safeParse({
      mode: "live_snippet",
      targetUrl: "https://ejemplo.com/landing",
      allowedOrigins: ["https://ejemplo.com"],
      steps: [
        {
          id: "S1",
          title: "Explorar propuesta",
          instruction: "Lee el titular principal y busca el botón de precios.",
          advanceOn: "manual",
        },
        {
          id: "S2",
          title: "Ir a precios",
          instruction: "Haz clic en Precios en la barra superior.",
          advanceOn: "url_match",
          urlPattern: "/pricing",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("acepta modo no_code_captures con hotspot", () => {
    const parsed = webEyetrackingConfigSchema.safeParse({
      mode: "no_code_captures",
      targetUrl: "https://competencia.com",
      steps: [
        {
          id: "S1",
          title: "Encontrar CTA",
          instruction: "Haz clic en el botón principal de registro.",
          advanceOn: "hotspot",
          hotspot: { x: 0.4, y: 0.3, w: 0.2, h: 0.08 },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rechaza pasos duplicados o url_match sin patrón", () => {
    expect(
      webEyetrackingConfigSchema.safeParse({
        targetUrl: "https://ejemplo.com",
        steps: [
          { id: "S1", title: "A", instruction: "Uno", advanceOn: "manual" },
          { id: "S1", title: "B", instruction: "Dos", advanceOn: "manual" },
        ],
      }).success,
    ).toBe(false);

    expect(
      webEyetrackingConfigSchema.safeParse({
        targetUrl: "https://ejemplo.com",
        steps: [
          {
            id: "S1",
            title: "A",
            instruction: "Ir a checkout",
            advanceOn: "url_match",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("extrae origen limpio con originFromUrl", () => {
    expect(originFromUrl("https://tienda.ejemplo.com/productos?a=1")).toBe(
      "https://tienda.ejemplo.com",
    );
    expect(originFromUrl("javascript:alert(1)")).toBeNull();
  });
});
