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
