/**
 * Tipos del motor IAT. Este módulo es puro (sin React, sin I/O) para poder
 * correrlo igual en el navegador (runner), en el servidor (recálculo) y en tests.
 *
 * Convención de categorías por dimensión:
 *  - "A" / "B"  : los dos conceptos objetivo (marcas u opciones comparadas).
 *  - "P1" / "P2": los polos del atributo. P1 = polo positivo (favorable),
 *                 P2 = polo negativo. El orden lo fija el investigador en el wizard.
 */
export type Protocol = "classic7" | "demo5";

export type CategoryId = "A" | "B" | "P1" | "P2";
export type Side = "left" | "right";
export type BlockNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Qué combinación comparte tecla en los bloques 3-4 (decisión única por
 * dimensión y sesión, 50/50):
 *  - "A_with_P1": Concepto A comparte tecla con el polo positivo.
 *  - "A_with_P2": Concepto A comparte tecla con el polo negativo.
 */
export type FirstCombo = "A_with_P1" | "A_with_P2";

export type BlockKind = "concepts" | "attributes" | "combined";
export type BlockRole = "intro" | "practice" | "test";

export interface ConceptInput {
  /** Nombre visible del concepto (p. ej. la marca). */
  label: string;
  /** Estímulos de texto que representan al concepto. Mínimo 1 (suele ser el propio nombre). */
  stimuli: string[];
}

export interface DimensionInput {
  /** Etiqueta del polo positivo (P1), p. ej. "Confiable". */
  positiveLabel: string;
  /** Etiqueta del polo negativo (P2), p. ej. "Poco confiable". */
  negativeLabel: string;
  positiveWords: string[];
  negativeWords: string[];
}

export interface PlannedTrial {
  block: BlockNumber;
  /** Posición 0-based dentro del bloque. */
  index: number;
  category: CategoryId;
  /** Identificador estable del estímulo, p. ej. "P1:3". */
  stimulusId: string;
  text: string;
  correctSide: Side;
}

export interface PlannedBlock {
  block: BlockNumber;
  kind: BlockKind;
  role: BlockRole;
  /** ¿Estos ensayos entran al D-score? (bloques 3, 4, 6 y 7). */
  countsForD: boolean;
  leftCategories: CategoryId[];
  rightCategories: CategoryId[];
  trials: PlannedTrial[];
}

/** Resultado de un ensayo tal como lo reporta el runner. */
export interface TrialRecord {
  block: number;
  /**
   * Latencia en ms hasta la respuesta CORRECTA. Si hubo error, incluye el
   * tiempo hasta la corrección (estilo Project Implicit).
   */
  rtMs: number;
  /** true si la primera respuesta fue incorrecta. */
  error: boolean;
}

export type Rng = () => number;
