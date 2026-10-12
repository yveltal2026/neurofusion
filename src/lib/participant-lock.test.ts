import { describe, expect, it } from "vitest";
import {
  clientIp,
  deviceCookieName,
  hashIp,
  newDeviceId,
  signDeviceId,
  verifyDeviceCookie,
} from "./participant-lock";
import { rateLimit, resetRateLimits } from "./rate-limit";

const SECRET = "secreto-de-prueba-1234567890abcdef";
const STUDY = "20000000-0000-4000-8000-00000000000a";

describe("cookie de dispositivo", () => {
  it("firma y verifica", () => {
    const id = newDeviceId();
    expect(verifyDeviceCookie(signDeviceId(id, SECRET), SECRET)).toBe(id);
  });

  it("rechaza cookies alteradas, ajenas o mal formadas", () => {
    const id = newDeviceId();
    const cookie = signDeviceId(id, SECRET);
    expect(verifyDeviceCookie(cookie, "otro-secreto-distinto-1234567890")).toBeNull();
    expect(verifyDeviceCookie(`${newDeviceId()}.${cookie.split(".")[1]}`, SECRET)).toBeNull();
    // El último carácter debe cambiar siempre; con "x" fijo la cookie quedaba igual 1 de cada 64 veces.
    const swap = cookie.at(-1) === "x" ? "y" : "x";
    expect(verifyDeviceCookie(cookie.slice(0, -1) + swap, SECRET)).toBeNull();
    expect(verifyDeviceCookie(cookie + "0", SECRET)).toBeNull();
    expect(verifyDeviceCookie("no-es-uuid.abc", SECRET)).toBeNull();
    expect(verifyDeviceCookie("sinpunto", SECRET)).toBeNull();
    expect(verifyDeviceCookie("", SECRET)).toBeNull();
    expect(verifyDeviceCookie(undefined, SECRET)).toBeNull();
  });

  it("el nombre de la cookie es por estudio", () => {
    expect(deviceCookieName(STUDY)).toBe("nf_d_200000000000400" + "0");
    expect(deviceCookieName(STUDY)).not.toBe(deviceCookieName("30000000-0000-4000-8000-00000000000a"));
  });
});

describe("huella de IP", () => {
  it("es determinista, no contiene la IP y cambia por estudio y secreto", () => {
    const h = hashIp("203.0.113.7", STUDY, SECRET);
    expect(h).toBe(hashIp("203.0.113.7", STUDY, SECRET));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(h).not.toBe(hashIp("203.0.113.8", STUDY, SECRET));
    expect(h).not.toBe(hashIp("203.0.113.7", "30000000-0000-4000-8000-00000000000a", SECRET));
    expect(h).not.toBe(hashIp("203.0.113.7", STUDY, "otro-secreto-distinto-1234567890"));
  });
});

describe("clientIp", () => {
  const h = (map: Record<string, string>) => ({ get: (k: string) => map[k.toLowerCase()] ?? null });
  it("toma la primera de x-forwarded-for", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("cae a x-real-ip y acepta IPv6", () => {
    expect(clientIp(h({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("devuelve null si falta o es basura", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "1".repeat(70) }))).toBeNull();
  });
});

describe("rateLimit", () => {
  it("permite hasta el límite y luego bloquea con retry-after", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t0 + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000 - 10);
  });
  it("libera pasada la ventana y aísla claves", () => {
    resetRateLimits();
    const t0 = 5_000_000;
    rateLimit("a", 1, 1000, t0);
    expect(rateLimit("a", 1, 1000, t0 + 500).ok).toBe(false);
    expect(rateLimit("b", 1, 1000, t0 + 500).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, t0 + 1001).ok).toBe(true);
  });
});
