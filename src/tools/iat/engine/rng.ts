import type { Rng } from "./types";

/** PRNG determinista (mulberry32). Sólo para pruebas y reproducibilidad. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rng para producción. Usa Web Crypto (disponible en navegador y Node ≥ 19)
 * para que el contrabalanceo no sea predecible.
 */
export function cryptoRng(): Rng {
  return () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

/** Fisher–Yates; devuelve una copia. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
