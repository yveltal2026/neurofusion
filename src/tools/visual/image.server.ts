import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ImagePart } from "@/lib/ai";
import { computeMetrics, estimateTextContrast, type ImageMetrics, type RawImage } from "./engine/metrics";
import { planTiles, type TilePlan } from "./engine/tiles";
import type { Aoi } from "./engine/aoi";

/** Píxeles máximos aceptados (evita "bombas" de descompresión). */
const MAX_PIXELS = 60_000_000;
const ANALYSIS_EDGE = 512;

export interface InspectedImage {
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  bytes: number;
}

const FORMATS = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

/** Verifica que el archivo sea realmente PNG/JPEG/WebP (por contenido, no por extensión). */
export async function inspectImage(buf: Buffer): Promise<InspectedImage> {
  const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata();
  const mime = FORMATS[meta.format as keyof typeof FORMATS];
  if (!mime || !meta.width || !meta.height) throw new Error("Formato no soportado: usa PNG, JPEG o WebP");
  return { width: meta.width, height: meta.height, mime, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.byteLength };
}

async function analysisRaw(buf: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(buf, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

export async function imageMetrics(buf: Buffer): Promise<ImageMetrics> {
  return computeMetrics(await analysisRaw(buf));
}

/** Contraste estimado (WCAG) en las AOI de texto, titular, precio, oferta y CTA. */
export async function textContrasts(buf: Buffer, aois: Aoi[]): Promise<{ id: string; label: string; ratio: number }[]> {
  const raw = await analysisRaw(buf);
  return aois
    .filter((a) => ["headline", "text", "cta", "price", "offer"].includes(a.kind))
    .map((a) => ({ id: a.id, label: a.label, ratio: estimateTextContrast(raw, a.box) }))
    .filter((x): x is { id: string; label: string; ratio: number } => x.ratio !== null);
}

/** Reduce y corta la imagen en franjas JPEG para la IA de visión. */
export async function imageForVision(buf: Buffer): Promise<{ plan: TilePlan; parts: ImagePart[] }> {
  const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().metadata();
  const plan = planTiles(meta.width ?? 1, meta.height ?? 1);
  const scaled = await sharp(buf, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: plan.scaledWidth, height: plan.scaledHeight, fit: "fill" })
    .png()
    .toBuffer();
  const parts: ImagePart[] = [];
  for (const t of plan.tiles) {
    const tile = await sharp(scaled).extract({ left: 0, top: t.top, width: plan.scaledWidth, height: t.height }).jpeg({ quality: 82 }).toBuffer();
    parts.push({ type: "image", mediaType: "image/jpeg", data: tile.toString("base64") });
  }
  return { plan, parts };
}

/** Ancho de la miniatura y de la versión de visualización (el original se conserva para IA y métricas). */
const THUMB_WIDTH = 480;
const THUMB_MAX_HEIGHT = 640;
const VIEW_WIDTH = 1400;
/** Límite de WebP por lado. */
const WEBP_MAX_SIDE = 16_383;

/**
 * Versiones ligeras para la interfaz: miniatura (parte superior, para capturas largas) y
 * versión de visualización con la MISMA proporción que el original (las AOI son relativas).
 */
export async function imageRenditions(buf: Buffer): Promise<{ thumb: Buffer; view: Buffer }> {
  const base = () => sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().flatten({ background: "#ffffff" });
  const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  const tw = Math.min(THUMB_WIDTH, w);
  const th = Math.max(1, Math.round((h * tw) / w));
  let thumbPipe = base().resize({ width: tw, height: th, fit: "fill" });
  if (th > THUMB_MAX_HEIGHT) thumbPipe = sharp(await thumbPipe.png().toBuffer()).extract({ left: 0, top: 0, width: tw, height: THUMB_MAX_HEIGHT });
  const thumb = await thumbPipe.webp({ quality: 72 }).toBuffer();

  const scale = Math.min(1, VIEW_WIDTH / w, WEBP_MAX_SIDE / h);
  const view = await base()
    .resize({ width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), fit: "fill" })
    .webp({ quality: 80 })
    .toBuffer();
  return { thumb, view };
}
