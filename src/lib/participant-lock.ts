import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Candado anti-participación repetida. Funciones puras (el secreto se recibe como
 * parámetro) para poder probarlas sin entorno.
 *
 *  1. Cookie de dispositivo firmada (HMAC): `device_id` UUID emitido por el servidor.
 *  2. Huella de IP: HMAC(secreto, estudio:IP). Nunca se guarda la IP en claro y el
 *     hash no se puede cruzar entre estudios.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deviceCookieName(studyId: string): string {
  return `nf_d_${studyId.replace(/-/g, "").slice(0, 16)}`;
}

export function newDeviceId(): string {
  return randomUUID();
}

function sign(deviceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`device:${deviceId}`).digest("base64url").slice(0, 32);
}

export function signDeviceId(deviceId: string, secret: string): string {
  return `${deviceId}.${sign(deviceId, secret)}`;
}

/** Devuelve el device_id si la cookie es auténtica; null si falta o fue alterada. */
export function verifyDeviceCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot === -1) return null;
  const deviceId = value.slice(0, dot);
  const given = value.slice(dot + 1);
  if (!UUID_RE.test(deviceId)) return null;
  const expected = sign(deviceId, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return deviceId;
}

export function hashIp(ip: string, studyId: string, secret: string): string {
  return createHmac("sha256", secret).update(`ip:${studyId}:${ip}`).digest("hex");
}

/** IP del cliente detrás de proxy (Vercel pone la real primero en x-forwarded-for). */
export function clientIp(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || null;
  if (!candidate || candidate.length > 64 || !/^[0-9a-fA-F:.]+$/.test(candidate)) return null;
  return candidate;
}

export const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
