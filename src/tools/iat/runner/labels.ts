import type { IatConfig } from "../config";
import type { CategoryId, PlannedBlock } from "../engine/types";

export interface CategoryLabels {
  A: string;
  B: string;
  P1: string;
  P2: string;
}

export function categoryLabels(config: IatConfig, dimensionIdx: number): CategoryLabels {
  const d = config.dimensions[dimensionIdx];
  return {
    A: config.conceptA.label,
    B: config.conceptB.label,
    P1: d.positiveLabel,
    P2: d.negativeLabel,
  };
}

export const isConcept = (c: CategoryId): boolean => c === "A" || c === "B";

/** Etiquetas de un lado del bloque: conceptos primero, luego atributos. */
export function sideLabels(categories: CategoryId[], labels: CategoryLabels): { text: string; concept: boolean }[] {
  return [...categories]
    .sort((a, b) => Number(isConcept(b)) - Number(isConcept(a)))
    .map((c) => ({ text: labels[c], concept: isConcept(c) }));
}

export interface BlockIntro {
  title: string;
  body: string;
}

/** Texto de instrucciones previo a cada bloque. */
export function blockIntro(block: PlannedBlock, labels: CategoryLabels, ordinal: number, total: number): BlockIntro {
  const left = sideLabels(block.leftCategories, labels)
    .map((l) => l.text)
    .join(" o ");
  const right = sideLabels(block.rightCategories, labels)
    .map((l) => l.text)
    .join(" o ");
  const progress = `Bloque ${ordinal} de ${total}`;

  let lead: string;
  if (block.kind === "concepts") {
    lead =
      block.block === 5
        ? `¡Atención! Los lados cambiaron. Ahora «${left}» va a la izquierda y «${right}» a la derecha.`
        : `Clasifica cada palabra según a qué pertenece: «${left}» a la izquierda y «${right}» a la derecha.`;
  } else if (block.kind === "attributes") {
    lead = `Clasifica cada palabra según su significado: «${left}» a la izquierda y «${right}» a la derecha.`;
  } else {
    const reversed = block.block === 6 || block.block === 7;
    lead = `${reversed ? "Las categorías cambiaron de combinación. " : "Ahora las categorías se combinan. "}Izquierda: «${left}». Derecha: «${right}».`;
  }
  return {
    title: progress,
    body: `${lead} Responde lo más rápido que puedas sin equivocarte. Si te equivocas aparecerá una X roja: responde con el otro lado para corregir.`,
  };
}

/** Foreground legible (blanco/negro) sobre un color hexadecimal de acento. */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}
