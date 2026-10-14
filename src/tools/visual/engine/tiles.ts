/**
 * Particionado de imágenes para la IA de visión. Las capturas de página completa
 * (p. ej. 1366×8000) se reducen y se cortan en franjas legibles; la IA devuelve cajas
 * por franja y aquí se traducen a coordenadas de la imagen completa.
 */

/** Ancho al que se reduce la imagen antes de cortarla (≈ límite útil de la visión). */
export const TILE_WIDTH = 1092;
/** Alto máximo de cada franja, en proporción al ancho (≈ 1.15 MP por franja). */
export const TILE_ASPECT = 1.0;
export const MAX_TILES = 4;

export interface TilePlan {
  scaledWidth: number;
  scaledHeight: number;
  tiles: { index: number; top: number; height: number }[];
  /** Fracción de la altura cubierta (1 = toda la imagen). */
  coverage: number;
}

export function planTiles(width: number, height: number): TilePlan {
  const scale = Math.min(1, TILE_WIDTH / width);
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));
  const maxH = Math.max(1, Math.round(sw * TILE_ASPECT * 1.6));
  if (sh <= maxH) return { scaledWidth: sw, scaledHeight: sh, tiles: [{ index: 0, top: 0, height: sh }], coverage: 1 };
  const tileH = Math.round(sw * TILE_ASPECT);
  const tiles: TilePlan["tiles"] = [];
  for (let top = 0, i = 0; top < sh && i < MAX_TILES; top += tileH, i++) tiles.push({ index: i, top, height: Math.min(tileH, sh - top) });
  const covered = tiles.reduce((a, t) => a + t.height, 0);
  return { scaledWidth: sw, scaledHeight: sh, tiles, coverage: covered / sh };
}

/** Caja 0–1000 relativa a una franja → caja 0–1 relativa a la imagen completa. */
export function tileBoxToImage(plan: TilePlan, tileIndex: number, box: [number, number, number, number]): [number, number, number, number] {
  const tile = plan.tiles[Math.min(Math.max(0, tileIndex), plan.tiles.length - 1)];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const y = (v: number) => clamp((tile.top + (v / 1000) * tile.height) / plan.scaledHeight);
  const [x0, y0, x1, y1] = box;
  return [clamp(Math.min(x0, x1) / 1000), y(Math.min(y0, y1)), clamp(Math.max(x0, x1) / 1000), y(Math.max(y0, y1))];
}
