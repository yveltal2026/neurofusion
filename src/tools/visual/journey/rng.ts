import { mulberry32 } from "@/tools/iat/engine/rng";

export interface SimRng {
  random(): number;
  /** Normal(mu, sigma) por Box–Muller. Consume SIEMPRE 2 uniformes (alineación entre sitios). */
  normal(mu: number, sigma: number): number;
}

export function createRng(seed: number): SimRng {
  const u = mulberry32(seed);
  return {
    random: u,
    normal(mu, sigma) {
      const u1 = Math.max(u(), 1e-12);
      const u2 = u();
      return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

export function shuffleInPlace<T>(xs: T[], rng: SimRng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
