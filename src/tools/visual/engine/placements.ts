/** Especificaciones de formatos publicitarios y de captura (revisión determinista). */

export interface PlacementSpec {
  id: string;
  label: string;
  group: "Meta" | "Google Display" | "Otros" | "Web";
  /** Proporciones aceptadas (ancho/alto). */
  ratios: number[];
  minWidth: number;
  minHeight: number;
  /** Tamaño exacto requerido (display). */
  exact?: { width: number; height: number };
  maxBytes?: number;
  note?: string;
}

export const PLACEMENTS: PlacementSpec[] = [
  { id: "meta_feed_square", label: "Meta · feed cuadrado 1:1", group: "Meta", ratios: [1], minWidth: 1080, minHeight: 1080, maxBytes: 30_000_000 },
  { id: "meta_feed_vertical", label: "Meta · feed vertical 4:5", group: "Meta", ratios: [4 / 5], minWidth: 1080, minHeight: 1350, maxBytes: 30_000_000 },
  { id: "meta_stories", label: "Meta · Stories/Reels 9:16", group: "Meta", ratios: [9 / 16], minWidth: 1080, minHeight: 1920, maxBytes: 30_000_000, note: "Deja libre ~14 % arriba y ~20 % abajo (zona de interfaz)." },
  { id: "display_300x250", label: "Display · 300×250", group: "Google Display", ratios: [300 / 250], minWidth: 300, minHeight: 250, exact: { width: 300, height: 250 }, maxBytes: 150_000 },
  { id: "display_728x90", label: "Display · 728×90", group: "Google Display", ratios: [728 / 90], minWidth: 728, minHeight: 90, exact: { width: 728, height: 90 }, maxBytes: 150_000 },
  { id: "display_160x600", label: "Display · 160×600", group: "Google Display", ratios: [160 / 600], minWidth: 160, minHeight: 600, exact: { width: 160, height: 600 }, maxBytes: 150_000 },
  { id: "display_300x600", label: "Display · 300×600", group: "Google Display", ratios: [300 / 600], minWidth: 300, minHeight: 600, exact: { width: 300, height: 600 }, maxBytes: 150_000 },
  { id: "display_320x50", label: "Display · 320×50 (móvil)", group: "Google Display", ratios: [320 / 50], minWidth: 320, minHeight: 50, exact: { width: 320, height: 50 }, maxBytes: 150_000 },
  { id: "display_970x250", label: "Display · 970×250", group: "Google Display", ratios: [970 / 250], minWidth: 970, minHeight: 250, exact: { width: 970, height: 250 }, maxBytes: 150_000 },
  { id: "youtube_thumbnail", label: "YouTube · miniatura 16:9", group: "Otros", ratios: [16 / 9], minWidth: 1280, minHeight: 720, maxBytes: 2_000_000 },
  { id: "linkedin_link", label: "LinkedIn · imagen de enlace 1.91:1", group: "Otros", ratios: [1.91], minWidth: 1200, minHeight: 627 },
  { id: "web_desktop", label: "Captura web · escritorio", group: "Web", ratios: [], minWidth: 1280, minHeight: 600 },
  { id: "web_mobile", label: "Captura web · móvil", group: "Web", ratios: [], minWidth: 360, minHeight: 640 },
];

export function getPlacement(id: string | null | undefined): PlacementSpec | undefined {
  return PLACEMENTS.find((p) => p.id === id);
}

export interface PlacementCheck {
  ok: boolean;
  label: string;
  detail: string;
}

export function checkPlacement(spec: PlacementSpec, img: { width: number; height: number; bytes: number }): PlacementCheck[] {
  const out: PlacementCheck[] = [];
  const ratio = img.width / img.height;
  if (spec.exact) {
    const ok = img.width === spec.exact.width && img.height === spec.exact.height;
    out.push({ ok, label: "Tamaño exacto", detail: `${img.width}×${img.height} px (requerido ${spec.exact.width}×${spec.exact.height}).` });
  } else {
    if (spec.ratios.length) {
      const best = spec.ratios.reduce((a, r) => (Math.abs(r - ratio) < Math.abs(a - ratio) ? r : a), spec.ratios[0]);
      const ok = Math.abs(ratio - best) / best <= 0.02;
      out.push({ ok, label: "Proporción", detail: `${ratio.toFixed(2)}:1 (esperado ${best.toFixed(2)}:1).` });
    }
    const okRes = img.width >= spec.minWidth && img.height >= spec.minHeight;
    out.push({ ok: okRes, label: "Resolución", detail: `${img.width}×${img.height} px (mínimo recomendado ${spec.minWidth}×${spec.minHeight}).` });
  }
  if (spec.maxBytes) {
    const ok = img.bytes <= spec.maxBytes;
    out.push({ ok, label: "Peso", detail: `${(img.bytes / 1024).toFixed(0)} KB (máximo ${(spec.maxBytes / 1024).toFixed(0)} KB).` });
  }
  return out;
}
