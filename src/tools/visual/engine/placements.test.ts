import { describe, expect, it } from "vitest";
import {
  checkPlacement,
  getPlacement,
  PLACEMENT_GROUPS,
  placementsByGroup,
} from "./placements";

describe("formatos publicitarios, impresos y de captura", () => {
  it("incluye los 4 grupos en el orden definido", () => {
    expect(PLACEMENT_GROUPS).toEqual([
      "Redes sociales",
      "Publicidad display",
      "Impresos",
      "Web y correo",
    ]);
    const grouped = placementsByGroup();
    expect(grouped.map((g) => g.group)).toEqual([...PLACEMENT_GROUPS]);
    for (const { items } of grouped) {
      expect(items.length).toBeGreaterThan(0);
    }
  });

  it("conserva los identificadores históricos para compatibilidad con la base de datos", () => {
    const ids = [
      "meta_feed_square",
      "meta_feed_vertical",
      "meta_stories",
      "display_300x250",
      "display_728x90",
      "display_160x600",
      "display_300x600",
      "display_320x50",
      "display_970x250",
      "youtube_thumbnail",
      "linkedin_link",
      "web_desktop",
      "web_mobile",
    ];
    for (const id of ids) {
      expect(getPlacement(id)?.id).toBe(id);
    }
  });

  it("agrega los formatos impresos clave: póster, flyer, tríptico, díptico, postal, tarjeta y roll-up", () => {
    const printIds = [
      "print_poster_18x24",
      "print_poster_24x36",
      "print_poster_a2",
      "print_poster_a3",
      "print_flyer_letter",
      "print_flyer_half_letter",
      "print_flyer_a5",
      "print_triptych_letter",
      "print_diptych_letter",
      "print_postcard",
      "print_business_card",
      "print_rollup",
    ];
    for (const id of printIds) {
      const spec = getPlacement(id);
      expect(spec).toBeDefined();
      expect(spec?.group).toBe("Impresos");
      expect(spec?.print).toBeDefined();
    }
  });

  it("revisa resolución efectiva en ppp para formatos impresos según tamaño final", () => {
    const poster = getPlacement("print_poster_18x24")!;
    // 18×24 in a 150 ppi = 2700×3600 px. Con 3000×4000 px supera el mínimo (166 ppi).
    const ok = checkPlacement(poster, { width: 3000, height: 4000, bytes: 5_000_000 });
    const ppiCheck = ok.find((c) => c.label === "Resolución de impresión");
    expect(ppiCheck?.ok).toBe(true);
    expect(ppiCheck?.detail).toContain("166 ppp");

    // Imagen de 900×1200 px da 50 ppi: insuficiente para impresión.
    const bad = checkPlacement(poster, { width: 900, height: 1200, bytes: 500_000 });
    expect(bad.find((c) => c.label === "Resolución de impresión")?.ok).toBe(false);
  });

  it("admite orientación horizontal o vertical en impresos girables (póster, flyer)", () => {
    const flyer = getPlacement("print_flyer_letter")!;
    // Carta vertical: 8.5 × 11 in (2550×3300 px a 300 ppi)
    const vert = checkPlacement(flyer, { width: 2550, height: 3300, bytes: 4_000_000 });
    expect(vert.find((c) => c.label === "Proporción")?.ok).toBe(true);
    // Carta horizontal: 3300×2550 px
    const horiz = checkPlacement(flyer, { width: 3300, height: 2550, bytes: 4_000_000 });
    expect(horiz.find((c) => c.label === "Proporción")?.ok).toBe(true);
  });

  it("rechaza orientación incorrecta en formatos con orientación fija (tríptico pliego abierto)", () => {
    const triptych = getPlacement("print_triptych_letter")!;
    // Tríptico carta abierto debe ser horizontal (11 × 8.5 in)
    const horiz = checkPlacement(triptych, { width: 3300, height: 2550, bytes: 4_000_000 });
    expect(horiz.find((c) => c.label === "Proporción")?.ok).toBe(true);
    // Vertical se rechaza porque un tríptico no se lee girado
    const vert = checkPlacement(triptych, { width: 2550, height: 3300, bytes: 4_000_000 });
    expect(vert.find((c) => c.label === "Proporción")?.ok).toBe(false);
  });
});
