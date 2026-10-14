/**
 * Protección SSRF: el servidor descarga URLs que escribe el analista, así que nunca
 * debe alcanzar la red interna (localhost, rangos privados, metadatos de la nube).
 * Se valida el host literal y TODAS las IP a las que resuelve. Riesgo residual
 * documentado: un rebinding de DNS entre la validación y la conexión.
 */
import { isIP } from "node:net";

export type Lookup = (hostname: string) => Promise<string[]>;

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true;
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Lanza BlockedUrlError si la URL no es http(s) pública en puerto estándar. */
export async function assertPublicUrl(raw: string, lookup: Lookup): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError("URL inválida");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError("Sólo se permiten URLs http(s)");
  if (u.username || u.password) throw new BlockedUrlError("La URL no puede llevar credenciales");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BlockedUrlError("Sólo se permiten los puertos 80 y 443");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new BlockedUrlError("Host no permitido");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError("Dirección privada no permitida");
    return;
  }
  let addrs: string[];
  try {
    addrs = await lookup(host);
  } catch {
    throw new BlockedUrlError("El dominio no resuelve");
  }
  if (!addrs.length) throw new BlockedUrlError("El dominio no resuelve");
  if (addrs.some(isPrivateIp)) throw new BlockedUrlError("El dominio resuelve a una dirección privada");
}
