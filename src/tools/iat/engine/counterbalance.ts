import type { BlockNumber, CategoryId, FirstCombo, Rng, Side } from "./types";

/** Decisión 50/50 e independiente por dimensión al cargar la sesión. */
export function chooseFirstCombo(rng: Rng): FirstCombo {
  return rng() < 0.5 ? "A_with_P1" : "A_with_P2";
}

export interface BlockSides {
  left: CategoryId[];
  right: CategoryId[];
}

/**
 * Qué categorías van en cada lado por bloque.
 *
 * - Bloques 1, 3 y 4: A a la izquierda, B a la derecha.
 * - Bloque 5: los conceptos se intercambian (A derecha, B izquierda).
 * - Bloques 6 y 7: conceptos intercambiados; los atributos NO se mueven, por lo
 *   que A pasa a compartir tecla con el polo opuesto al de los bloques 3-4.
 * - Los atributos del bloque 2 usan los mismos lados que en 3-4.
 */
export function blockSides(block: BlockNumber, combo: FirstCombo): BlockSides {
  const attrLeft: CategoryId = combo === "A_with_P1" ? "P1" : "P2";
  const attrRight: CategoryId = combo === "A_with_P1" ? "P2" : "P1";

  switch (block) {
    case 1:
      return { left: ["A"], right: ["B"] };
    case 2:
      return { left: [attrLeft], right: [attrRight] };
    case 3:
    case 4:
      return { left: ["A", attrLeft], right: ["B", attrRight] };
    case 5:
      return { left: ["B"], right: ["A"] };
    case 6:
    case 7:
      return { left: ["B", attrLeft], right: ["A", attrRight] };
  }
}

export function sideOf(category: CategoryId, sides: BlockSides): Side | null {
  if (sides.left.includes(category)) return "left";
  if (sides.right.includes(category)) return "right";
  return null;
}
