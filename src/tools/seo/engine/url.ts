/** Utilidades de URL puras (sin red). */

/**
 * Normaliza para comparar: sin hash, host en minúsculas, sin puerto por defecto.
 * La barra final SE CONSERVA: `/ia` y `/ia/` son URLs distintas (también para Google) y
 * muchos sitios redirigen de una a otra; quitarla hacía que el rastreador entrara en bucle.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
  return u.toString();
}

/** Host sin "www." para decidir si un enlace es interno. */
export function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export function isSameSite(a: string, b: string): boolean {
  try {
    return siteHost(a) === siteHost(b);
  } catch {
    return false;
  }
}

export function originOf(url: string): string {
  return new URL(url).origin;
}
