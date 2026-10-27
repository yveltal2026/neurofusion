/**
 * Áreas de interés (AOI) y renders de atención. Puerto del módulo attention de NeuroSEO
 * con dos cambios: (1) las AOI pueden venir de la IA, pero el analista las revisa;
 * (2) el render es determinista (sin jitter aleatorio) y con umbral para no teñir toda
 * la imagen (defecto D-14). Coordenadas normalizadas 0–1 respecto a la imagen completa.
 */
import { z } from "zod";

export const AOI_KINDS = ["headline", "cta", "logo", "product", "person", "price", "offer", "text", "image", "navigation", "form", "badge", "other"] as const;
export type AoiKind = (typeof AOI_KINDS)[number];

export const AOI_KIND_LABEL: Record<AoiKind, string> = {
  headline: "Titular",
  cta: "Llamado a la acción",
  logo: "Logotipo",
  product: "Producto",
  person: "Persona / rostro",
  price: "Precio",
  offer: "Oferta / promoción",
  text: "Texto",
  image: "Imagen",
  navigation: "Navegación",
  form: "Formulario",
  badge: "Sello / insignia",
  other: "Otro",
};

const unit = z.number().min(0).max(1);

export const aoiSchema = z
  .object({
    id: z.string().trim().min(1).max(12),
    label: z.string().trim().min(1).max(80),
    kind: z.enum(AOI_KINDS),
    box: z.tuple([unit, unit, unit, unit]),
    /** Atracción visual estimada (0–1): peso en el mapa de calor. */
    attention: unit,
    /** Importancia para el objetivo de la pieza (1–5). */
    importance: z.number().int().min(1).max(5),
    /** Posición en el recorrido visual estimado (1 = primero); null si no se prevé que se mire. */
    order: z.number().int().min(1).max(50).nullable(),
  })
  .refine((a) => a.box[2] > a.box[0] && a.box[3] > a.box[1], "La caja debe tener ancho y alto");

export type Aoi = z.infer<typeof aoiSchema>;
export const aoiListSchema = z.array(aoiSchema).max(30);

/** Atracción máxima para considerar que un elemento pasa desapercibido. */
export const LOW_ATTENTION = 0.4;

/** Zonas ciegas: elementos importantes (≥ 4) con atracción baja (≤ 0.4). */
export function blindZones(aois: Aoi[]): Aoi[] {
  return aois.filter((a) => a.importance >= 4 && a.attention <= LOW_ATTENTION);
}

export type ColdLevel = "blind" | "low";
export interface ColdZone {
  aoi: Aoi;
  /** «blind» = importante (4–5) y poco visto; «low» = importancia media (3) y poco visto. */
  level: ColdLevel;
}

/**
 * Elementos "fríos": atracción baja (≤ 0.4) y que importan (≥ 3). Los de importancia 4–5 son zonas
 * ciegas; los de importancia 3 se muestran aparte como «baja atención». Primero los más importantes.
 */
export function coldZones(aois: Aoi[]): ColdZone[] {
  return aois
    .filter((a) => a.importance >= 3 && a.attention <= LOW_ATTENTION)
    .map((aoi): ColdZone => ({ aoi, level: aoi.importance >= 4 ? "blind" : "low" }))
    .sort((a, b) => b.aoi.importance - a.aoi.importance || a.aoi.attention - b.aoi.attention);
}

/** Elementos que importan (≥ 3) pero a los que la IA no prevé que se mire (sin lugar en el recorrido). */
export function outsidePath(aois: Aoi[]): Aoi[] {
  return aois.filter((a) => a.order === null && a.importance >= 3).sort((a, b) => b.importance - a.importance);
}

/** Recorrido visual estimado: AOI con orden, de menor a mayor. */
export function gazePath(aois: Aoi[]): Aoi[] {
  return aois.filter((a) => a.order !== null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Campo de atención sobre una rejilla gw×gh (valores 0–1). Una gaussiana por AOI,
 * centrada en la caja, con sigma proporcional a su tamaño y amplitud = attention.
 */
export function attentionField(aois: Aoi[], gw: number, gh: number, aspect = 1): Float32Array {
  const acc = new Float32Array(gw * gh);
  const maxW = Math.max(1e-6, ...aois.map((a) => a.attention));
  for (const a of aois) {
    if (a.attention <= 0) continue;
    const [x0, y0, x1, y1] = a.box;
    const cx = ((x0 + x1) / 2) * gw;
    const cy = ((y0 + y1) / 2) * gh;
    // Sigma mínimo ~2.5 % del ancho para que cajas pequeñas sigan visibles.
    const sx = Math.max(gw * 0.025, ((x1 - x0) * gw) / 2.6);
    const sy = Math.max((gh * 0.025) / Math.max(aspect, 1e-6), ((y1 - y0) * gh) / 2.6);
    const amp = a.attention / maxW;
    const xmin = Math.max(0, Math.floor(cx - 3 * sx)), xmax = Math.min(gw - 1, Math.ceil(cx + 3 * sx));
    const ymin = Math.max(0, Math.floor(cy - 3 * sy)), ymax = Math.min(gh - 1, Math.ceil(cy + 3 * sy));
    for (let y = ymin; y <= ymax; y++) {
      const dy = (y + 0.5 - cy) ** 2 / (2 * sy * sy);
      for (let x = xmin; x <= xmax; x++) {
        acc[y * gw + x] += amp * Math.exp(-((x + 0.5 - cx) ** 2 / (2 * sx * sx) + dy));
      }
    }
  }
  let max = 0;
  for (const v of acc) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < acc.length; i++) acc[i] = (acc[i] / max) ** 0.85;
  return acc;
}

/**
 * Mapa de color tipo "jet". Por debajo del umbral es transparente y la opacidad crece
 * gradualmente desde ahí (sin borde duro ni velo sobre toda la imagen).
 */
export function heatColor(v: number, threshold = 0.22): [number, number, number, number] {
  if (v <= threshold) return [0, 0, 0, 0];
  const t = Math.min(1, Math.max(0, v));
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
  const alpha = 0.7 * Math.min(1, ((t - threshold) / (1 - threshold)) * 1.8);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), Math.round(alpha * 255)];
}
