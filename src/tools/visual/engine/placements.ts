/** Especificaciones de formatos publicitarios, impresos y de captura (revisión determinista). */

/** Grupos en el orden en que se muestran en el selector de formato. */
export const PLACEMENT_GROUPS = ["Redes sociales", "Publicidad display", "Impresos", "Web y correo"] as const;
export type PlacementGroup = (typeof PLACEMENT_GROUPS)[number];

export interface PlacementSpec {
  /** Identificador estable: se guarda en `visual_assets.placement`; no renombrar. */
  id: string;
  label: string;
  group: PlacementGroup;
  /** Proporciones aceptadas (ancho/alto). */
  ratios: number[];
  /** Tolerancia relativa de la proporción (por defecto 2 %). */
  ratioTolerance?: number;
  /** Acepta la pieza en vertical u horizontal (impresos). */
  rotatable?: boolean;
  minWidth: number;
  minHeight: number;
  /** Tamaño exacto requerido (display). */
  exact?: { width: number; height: number };
  /** Tamaño final impreso en pulgadas (sin sangrado) y resolución mínima recomendada. */
  print?: { widthIn: number; heightIn: number; minPpi: number };
  maxBytes?: number;
  note?: string;
}

const PRINT_NOTE = "Se revisa la exportación RGB; el archivo final de imprenta (PDF/CMYK, sangrado y marcas de corte) se valida aparte.";

/** Impreso: deriva la resolución mínima de su tamaño final y su resolución recomendada. */
function printSpec(id: string, label: string, widthIn: number, heightIn: number, minPpi: number, extra: Partial<PlacementSpec> = {}): PlacementSpec {
  return {
    id,
    label,
    group: "Impresos",
    ratios: [widthIn / heightIn],
    // Admite el sangrado habitual (3 mm por lado) sin confundir formatos cercanos.
    ratioTolerance: 0.04,
    rotatable: true,
    minWidth: Math.round(widthIn * minPpi),
    minHeight: Math.round(heightIn * minPpi),
    print: { widthIn, heightIn, minPpi },
    note: PRINT_NOTE,
    ...extra,
  };
}

const CM = 1 / 2.54;

export const PLACEMENTS: PlacementSpec[] = [
  // Redes sociales
  { id: "meta_feed_square", label: "Meta · feed cuadrado 1:1", group: "Redes sociales", ratios: [1], minWidth: 1080, minHeight: 1080, maxBytes: 30_000_000 },
  { id: "meta_feed_vertical", label: "Meta · feed vertical 4:5", group: "Redes sociales", ratios: [4 / 5], minWidth: 1080, minHeight: 1350, maxBytes: 30_000_000 },
  { id: "meta_feed_landscape", label: "Meta · feed horizontal 1.91:1", group: "Redes sociales", ratios: [1.91], minWidth: 1200, minHeight: 628, maxBytes: 30_000_000 },
  { id: "meta_stories", label: "Meta · Stories/Reels 9:16", group: "Redes sociales", ratios: [9 / 16], minWidth: 1080, minHeight: 1920, maxBytes: 30_000_000, note: "Deja libre ~14 % arriba y ~20 % abajo (zona de interfaz)." },
  { id: "tiktok_vertical", label: "TikTok · vertical 9:16", group: "Redes sociales", ratios: [9 / 16], minWidth: 1080, minHeight: 1920, note: "Deja libre la franja inferior y el lateral derecho (botones y descripción)." },
  { id: "linkedin_square", label: "LinkedIn · publicación cuadrada 1:1", group: "Redes sociales", ratios: [1], minWidth: 1200, minHeight: 1200 },
  { id: "linkedin_link", label: "LinkedIn · imagen de enlace 1.91:1", group: "Redes sociales", ratios: [1.91], minWidth: 1200, minHeight: 627 },
  { id: "x_post", label: "X · imagen 16:9", group: "Redes sociales", ratios: [16 / 9], minWidth: 1200, minHeight: 675, maxBytes: 5_000_000 },
  { id: "pinterest_pin", label: "Pinterest · pin 2:3", group: "Redes sociales", ratios: [2 / 3], minWidth: 1000, minHeight: 1500, maxBytes: 20_000_000 },
  { id: "youtube_thumbnail", label: "YouTube · miniatura 16:9", group: "Redes sociales", ratios: [16 / 9], minWidth: 1280, minHeight: 720, maxBytes: 2_000_000 },

  // Publicidad display
  { id: "display_300x250", label: "Display · 300×250", group: "Publicidad display", ratios: [300 / 250], minWidth: 300, minHeight: 250, exact: { width: 300, height: 250 }, maxBytes: 150_000 },
  { id: "display_728x90", label: "Display · 728×90", group: "Publicidad display", ratios: [728 / 90], minWidth: 728, minHeight: 90, exact: { width: 728, height: 90 }, maxBytes: 150_000 },
  { id: "display_160x600", label: "Display · 160×600", group: "Publicidad display", ratios: [160 / 600], minWidth: 160, minHeight: 600, exact: { width: 160, height: 600 }, maxBytes: 150_000 },
  { id: "display_300x600", label: "Display · 300×600", group: "Publicidad display", ratios: [300 / 600], minWidth: 300, minHeight: 600, exact: { width: 300, height: 600 }, maxBytes: 150_000 },
  { id: "display_320x50", label: "Display · 320×50 (móvil)", group: "Publicidad display", ratios: [320 / 50], minWidth: 320, minHeight: 50, exact: { width: 320, height: 50 }, maxBytes: 150_000 },
  { id: "display_970x250", label: "Display · 970×250", group: "Publicidad display", ratios: [970 / 250], minWidth: 970, minHeight: 250, exact: { width: 970, height: 250 }, maxBytes: 150_000 },

  // Impresos (resolución recomendada: 300 ppp en mano; 150 ppp o menos a distancia)
  printSpec("print_poster_18x24", "Póster · 18×24 in (46×61 cm)", 18, 24, 150),
  printSpec("print_poster_24x36", "Póster · 24×36 in (61×91 cm)", 24, 36, 150),
  printSpec("print_poster_a2", "Póster · A2 (42×59.4 cm)", 42 * CM, 59.4 * CM, 150),
  printSpec("print_poster_a3", "Póster · A3 (29.7×42 cm)", 29.7 * CM, 42 * CM, 300),
  printSpec("print_flyer_letter", "Flyer · carta (21.6×27.9 cm)", 8.5, 11, 300),
  printSpec("print_flyer_half_letter", "Flyer · media carta (14×21.6 cm)", 5.5, 8.5, 300),
  printSpec("print_flyer_a5", "Flyer · A5 (14.8×21 cm)", 14.8 * CM, 21 * CM, 300),
  printSpec("print_triptych_letter", "Tríptico · carta abierto (27.9×21.6 cm)", 11, 8.5, 300, {
    rotatable: false,
    note: `Sube el pliego abierto: tres paneles de ~9.3 cm; revisa que ningún texto caiga en los pliegues. ${PRINT_NOTE}`,
  }),
  printSpec("print_diptych_letter", "Díptico · carta abierto (27.9×21.6 cm)", 11, 8.5, 300, {
    rotatable: false,
    note: `Sube el pliego abierto: dos paneles de 14 cm; revisa que ningún texto caiga en el pliegue. ${PRINT_NOTE}`,
  }),
  printSpec("print_postcard", "Postal · 6×4 in (15.2×10.2 cm)", 6, 4, 300),
  printSpec("print_business_card", "Tarjeta de presentación · 9×5 cm", 9 * CM, 5 * CM, 300, { ratioTolerance: 0.07 }),
  printSpec("print_rollup", "Banner roll-up · 85×200 cm", 85 * CM, 200 * CM, 100, { rotatable: false }),

  // Web y correo
  { id: "web_desktop", label: "Captura web · escritorio", group: "Web y correo", ratios: [], minWidth: 1280, minHeight: 600 },
  { id: "web_mobile", label: "Captura web · móvil", group: "Web y correo", ratios: [], minWidth: 360, minHeight: 640 },
  { id: "email_newsletter", label: "Correo · boletín (600 px de ancho)", group: "Web y correo", ratios: [], minWidth: 600, minHeight: 200, note: "Se diseña a 600 px de ancho; exporta a 2× (1200 px) para pantallas de alta densidad." },
];

export function getPlacement(id: string | null | undefined): PlacementSpec | undefined {
  return PLACEMENTS.find((p) => p.id === id);
}

/** Formatos agrupados en el orden de `PLACEMENT_GROUPS` (grupos vacíos omitidos). */
export function placementsByGroup(): { group: PlacementGroup; items: PlacementSpec[] }[] {
  return PLACEMENT_GROUPS.map((group) => ({ group, items: PLACEMENTS.filter((p) => p.group === group) })).filter((g) => g.items.length);
}

export interface PlacementCheck {
  ok: boolean;
  label: string;
  detail: string;
}

const inches = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function checkPlacement(spec: PlacementSpec, img: { width: number; height: number; bytes: number }): PlacementCheck[] {
  const out: PlacementCheck[] = [];
  const ratio = img.width / img.height;
  if (spec.exact) {
    const ok = img.width === spec.exact.width && img.height === spec.exact.height;
    out.push({ ok, label: "Tamaño exacto", detail: `${img.width}×${img.height} px (requerido ${spec.exact.width}×${spec.exact.height}).` });
  } else {
    if (spec.ratios.length) {
      const candidates = spec.rotatable ? spec.ratios.flatMap((r) => [r, 1 / r]) : spec.ratios;
      const best = candidates.reduce((a, r) => (Math.abs(r - ratio) < Math.abs(a - ratio) ? r : a), candidates[0]);
      const ok = Math.abs(ratio - best) / best <= (spec.ratioTolerance ?? 0.02);
      out.push({ ok, label: "Proporción", detail: `${ratio.toFixed(2)}:1 (esperado ${best.toFixed(2)}:1).` });
    }
    if (spec.print) {
      // Resolución efectiva al tamaño final, sin importar la orientación de la pieza.
      const [longPx, shortPx] = img.width >= img.height ? [img.width, img.height] : [img.height, img.width];
      const { widthIn, heightIn, minPpi } = spec.print;
      const [longIn, shortIn] = widthIn >= heightIn ? [widthIn, heightIn] : [heightIn, widthIn];
      const ppi = Math.floor(Math.min(longPx / longIn, shortPx / shortIn));
      out.push({
        ok: ppi >= Math.floor(minPpi * 0.98),
        label: "Resolución de impresión",
        detail: `${ppi} ppp a ${inches(widthIn)}×${inches(heightIn)} in (mínimo recomendado ${minPpi} ppp: ${spec.minWidth}×${spec.minHeight} px).`,
      });
    } else {
      const okRes = img.width >= spec.minWidth && img.height >= spec.minHeight;
      out.push({ ok: okRes, label: "Resolución", detail: `${img.width}×${img.height} px (mínimo recomendado ${spec.minWidth}×${spec.minHeight}).` });
    }
  }
  if (spec.maxBytes) {
    const ok = img.bytes <= spec.maxBytes;
    out.push({ ok, label: "Peso", detail: `${(img.bytes / 1024).toFixed(0)} KB (máximo ${(spec.maxBytes / 1024).toFixed(0)} KB).` });
  }
  return out;
}
