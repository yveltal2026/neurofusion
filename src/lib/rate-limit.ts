/**
 * Limitador de ventana deslizante en memoria. Frena inundaciones desde una misma
 * instancia; en serverless cada instancia tiene su propio contador, así que es una
 * defensa básica, no una garantía. Para SaaS: sustituir por un almacén compartido
 * (Upstash/Vercel KV) manteniendo esta misma firma.
 */
const buckets = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  if (now - lastSweep > windowMs && buckets.size > 5000) {
    for (const [k, hits] of buckets) {
      if (hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: windowMs - (now - hits[0]) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}

/** Sólo para pruebas. */
export function resetRateLimits(): void {
  buckets.clear();
}
