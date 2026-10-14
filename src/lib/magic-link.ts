import { randomBytes } from "node:crypto";

/** 32 bytes aleatorios en base64url → 43 caracteres [A-Za-z0-9_-]. */
export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Validación barata de forma antes de consultar la BD. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function magicLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/s/${token}`;
}
