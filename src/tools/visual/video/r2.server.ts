import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

export const MAX_VIDEO_FILE_BYTES = 150 * 1024 * 1024; // 150 MB

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Dominio público opcional con caché de Cloudflare delante del bucket R2. */
  publicBaseUrl?: string;
}

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const r2UploadRequestSchema = z.object({
  studyId: z.string().uuid(),
  assetId: z.string().uuid(),
  mimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  byteLength: z.number().int().min(1_024).max(MAX_VIDEO_FILE_BYTES),
});

export type R2UploadRequest = z.infer<typeof r2UploadRequestSchema>;

/** Lee la configuración de Cloudflare R2 desde variables de entorno. */
export function readR2Config(
  env: Readonly<Record<string, string | undefined>> = process.env,
): R2Config | null {
  const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.CLOUDFLARE_R2_BUCKET?.trim();
  const publicBaseUrl = env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  if (publicBaseUrl) {
    try { if (new URL(publicBaseUrl).protocol !== "https:") return null; } catch { return null; }
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
  };
}

export function isR2Configured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readR2Config(env) !== null;
}

/**
 * Construye una clave S3 determinista y libre de path traversal para videos en R2.
 */
export function buildR2VideoKey(
  studyId: string,
  assetId: string,
  mimeType: AllowedVideoMimeType,
): string {
  if (!uuidRegex.test(studyId) || !uuidRegex.test(assetId)) {
    throw new Error("studyId y assetId deben ser UUID válidos.");
  }
  const ext = mimeType === "video/webm" ? "webm" : "mp4";
  return `studies/${studyId.toLowerCase()}/videos/${assetId.toLowerCase()}.${ext}`;
}

/** Una credencial de almacenamiento nunca autoriza a leer objetos de otro estudio. */
export function isR2VideoKeyForStudy(key: string, studyId: string): boolean {
  const match = /^studies\/([^/]+)\/videos\/([^/]+)\.(mp4|webm)$/.exec(key);
  return Boolean(match && uuidRegex.test(match[1]) && uuidRegex.test(match[2])
    && uuidRegex.test(studyId) && match[1] === studyId.toLowerCase());
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

/**
 * Genera una URL prefirmada compatible con S3 (AWS Signature Version 4) para Cloudflare R2
 * sin depender de paquetes externos de AWS SDK.
 */
export function createR2PresignedUrl(options: {
  config: R2Config;
  method: "PUT" | "GET" | "HEAD";
  key: string;
  expiresInSeconds?: number;
  now?: Date;
}): string {
  const { config, method } = options;
  const expires = Math.min(
    604_800,
    Math.max(60, Math.floor(options.expiresInSeconds ?? (method === "PUT" ? 900 : 3600))),
  );
  const cleanKey = options.key.replace(/^\/+/, "");
  if (!cleanKey || cleanKey.includes("..")) {
    throw new Error("Clave de objeto R2 inválida.");
  }

  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const { amzDate, dateStamp } = formatAmzDate(options.now ?? new Date());
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const encodedPath = [config.bucket, ...cleanKey.split("/")]
    .map(encodeRfc3986)
    .join("/");
  const canonicalUri = `/${encodedPath}`;

  const queryParams: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  queryParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/**
 * Resuelve la URL de reproducción para el participante (precarga en Blob):
 * - Si hay `publicBaseUrl` configurado (CDN de Cloudflare con caché en borde), sirve desde ahí.
 * - De lo contrario, firma una URL `GET` directa contra R2.
 */
export function resolveR2PlaybackUrl(options: {
  config: R2Config;
  key: string;
  expiresInSeconds?: number;
  now?: Date;
}): string {
  const cleanKey = options.key.replace(/^\/+/, "");
  if (options.config.publicBaseUrl) {
    const encodedKey = cleanKey.split("/").map(encodeRfc3986).join("/");
    return `${options.config.publicBaseUrl}/${encodedKey}`;
  }
  return createR2PresignedUrl({
    config: options.config,
    method: "GET",
    key: cleanKey,
    expiresInSeconds: options.expiresInSeconds ?? 3600,
    now: options.now,
  });
}

/** Genera el par de URLs (subida PUT y reproducción GET) para un estímulo de video en R2. */
export function createR2VideoUploadSession(
  input: R2UploadRequest,
  config: R2Config,
  now = new Date(),
) {
  const parsed = r2UploadRequestSchema.parse(input);
  const key = buildR2VideoKey(parsed.studyId, parsed.assetId, parsed.mimeType);
  const uploadUrl = createR2PresignedUrl({
    config,
    method: "PUT",
    key,
    expiresInSeconds: 900,
    now,
  });
  const playbackUrl = resolveR2PlaybackUrl({
    config,
    key,
    expiresInSeconds: 3600,
    now,
  });

  return {
    storageKey: key,
    uploadUrl,
    playbackUrl,
    requiredHeaders: {
      "Content-Type": parsed.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    expiresInSeconds: 900,
  };
}
