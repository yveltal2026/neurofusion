import { describe, expect, it } from "vitest";
import { journeyConfigSchema, siteKey, visualConfigSchema } from "./config";
import { DEFAULT_QUOTAS } from "./journey/calibration";
import { buildRatings, missingRatings } from "./journey/ratings";
import { rubricItems } from "./journey/rubric";

const journey = {
  mode: "journey",
  objective: "Comprar una licuadora",
  sites: [
    { key: "tienda", name: "Tienda", url: "https://tienda.mx", competitor: false },
    { key: "rival", name: "Rival", url: "https://rival.mx", competitor: true },
  ],
  tasks: [
    { id: "T1", name: "Buscar", instruction: "Busca", kind: "busqueda" },
    { id: "T2", name: "Pagar", instruction: "Paga", kind: "carrito" },
  ],
  panel: { seed: 42 },
};

describe("configuración visual", () => {
  it("acepta piezas y journey con cuotas por defecto", () => {
    expect(visualConfigSchema.parse({ mode: "pieces", objective: "x" })).toMatchObject({ mode: "pieces", brand: "" });
    const j = journeyConfigSchema.parse(journey);
    expect(j.panel.quotas).toEqual(DEFAULT_QUOTAS);
    expect(j.panel.calibration).toBe("cal-mx-2026.1");
  });

  it("exige exactamente un sitio principal y cuotas que sumen 100", () => {
    expect(visualConfigSchema.safeParse({ ...journey, sites: journey.sites.map((s) => ({ ...s, competitor: true })) }).success).toBe(false);
    const bad = { ...journey, panel: { seed: 1, quotas: { ...DEFAULT_QUOTAS, literacy: { Alta: 50, Media: 50, Baja: 50 } } } };
    expect(visualConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("genera claves de sitio estables y sin choques", () => {
    expect(siteKey("Liverpool México")).toBe("liverpool-mexico");
    expect(siteKey("Tienda", ["tienda"])).toBe("tienda-2");
  });
});

describe("calificaciones", () => {
  const cfg = journeyConfigSchema.parse(journey);
  it("la rúbrica incluye 7 fricciones + una base por tarea", () => {
    expect(rubricItems(cfg.tasks).map((i) => i.key)).toContain("base_exito.T2");
    expect(rubricItems(cfg.tasks)).toHaveLength(9);
  });
  it("detecta faltantes y arma la entrada del modelo", () => {
    const rows = [
      { site_key: "tienda", item_key: "resenas_visibles", value: 0.75 },
      { site_key: "tienda", item_key: "base_exito.T1", value: 0.8 },
      { site_key: "rival", item_key: "resenas_visibles", value: 0.1 },
    ];
    expect(missingRatings(cfg, rows, "tienda")).toHaveLength(7);
    const r = buildRatings(cfg, rows, "tienda");
    expect(r.frictions.resenas_visibles).toBe(0.75);
    expect(r.baseSuccess.T1).toBe(0.8);
  });
});
