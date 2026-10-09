import type { BlockKind, BlockNumber, BlockRole, Protocol } from "./types";

export interface BlockSpec {
  block: BlockNumber;
  kind: BlockKind;
  role: BlockRole;
  trials: number;
  countsForD: boolean;
}

/**
 * Protocolo clásico de 7 bloques (Greenwald, Nosek & Banaji, 2003):
 * 20 + 20 + 20 + 40 + 40 + 20 + 40 = 200 ensayos por dimensión.
 */
const CLASSIC7: BlockSpec[] = [
  { block: 1, kind: "concepts", role: "intro", trials: 20, countsForD: false },
  { block: 2, kind: "attributes", role: "intro", trials: 20, countsForD: false },
  { block: 3, kind: "combined", role: "practice", trials: 20, countsForD: true },
  { block: 4, kind: "combined", role: "test", trials: 40, countsForD: true },
  { block: 5, kind: "concepts", role: "intro", trials: 40, countsForD: false },
  { block: 6, kind: "combined", role: "practice", trials: 20, countsForD: true },
  { block: 7, kind: "combined", role: "test", trials: 40, countsForD: true },
];

/**
 * Versión demo de 5 bloques: sin los bloques 1 y 2 y con 10 ensayos por bloque
 * combinado. La skill no fija el tamaño del bloque 5 (inversión de conceptos);
 * usamos 20, la mitad del clásico. Se conserva la numeración 3-7 para que el
 * cálculo del D-score sea idéntico en ambos protocolos.
 */
const DEMO5: BlockSpec[] = [
  { block: 3, kind: "combined", role: "practice", trials: 10, countsForD: true },
  { block: 4, kind: "combined", role: "test", trials: 10, countsForD: true },
  { block: 5, kind: "concepts", role: "intro", trials: 20, countsForD: false },
  { block: 6, kind: "combined", role: "practice", trials: 10, countsForD: true },
  { block: 7, kind: "combined", role: "test", trials: 10, countsForD: true },
];

export function getBlockSpecs(protocol: Protocol): BlockSpec[] {
  return (protocol === "classic7" ? CLASSIC7 : DEMO5).map((b) => ({ ...b }));
}

export function trialsPerDimension(protocol: Protocol): number {
  return getBlockSpecs(protocol).reduce((sum, b) => sum + b.trials, 0);
}

/** Bloques cuyos ensayos entran al D-score. */
export const D_FIRST_BLOCKS: readonly number[] = [3, 4];
export const D_SECOND_BLOCKS: readonly number[] = [6, 7];

/**
 * Estimación gruesa de la duración de la sesión (sin consentimiento ni
 * formulario): ~1.1 s por ensayo (RT medio + intervalo entre ensayos) más ~15 s
 * de instrucciones por bloque.
 */
export function estimateMinutes(protocol: Protocol, dimensions: number): number {
  const specs = getBlockSpecs(protocol);
  const perDimSeconds =
    trialsPerDimension(protocol) * 1.1 + specs.length * 15;
  return Math.max(1, Math.ceil((perDimSeconds * dimensions) / 60));
}
