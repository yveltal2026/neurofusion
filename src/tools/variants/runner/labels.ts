import type { InputMode } from "@/tools/iat/runner/device";
import type { VariantConfig } from "../config";
import type { GnatBlock, PrimingBlock, ScBlock, Side, VariantPlan } from "../plan";

/** Textos que el participante ve en las pantallas de instrucciones y como rótulos de las teclas. */

export interface SideLabels {
  left: string[];
  right: string[];
}

type AnyBlock = ScBlock | GnatBlock | PrimingBlock;

const other = (s: Side): Side => (s === "left" ? "right" : "left");

/** Rótulos de cada lado para SC-IAT y priming; el GNAT no usa lados. */
export function sideLabelsFor(config: VariantConfig, plan: VariantPlan, block: AnyBlock): SideLabels | null {
  if (config.variant === "gnat" || plan.variant === "gnat") return null;
  const a = config.attribute;
  if (config.variant === "sc_iat" && plan.variant === "sc_iat") {
    const b = block as ScBlock;
    const paired = b.pairing === "target_positive" ? a.positiveLabel : a.negativeLabel;
    const opposite = b.pairing === "target_positive" ? a.negativeLabel : a.positiveLabel;
    const labels: SideLabels = { left: [], right: [] };
    labels[b.sharedSide] = [config.concepts[0].label, paired];
    labels[other(b.sharedSide)] = [opposite];
    return labels;
  }
  if (plan.variant === "priming") {
    const labels: SideLabels = { left: [], right: [] };
    labels[plan.positiveSide] = [a.positiveLabel];
    labels[other(plan.positiveSide)] = [a.negativeLabel];
    return labels;
  }
  return null;
}

/** GNAT: qué categorías de este bloque exigen responder («go»). */
export function gnatTargets(config: VariantConfig, block: GnatBlock): string[] {
  const pole = block.pole === "positive" ? config.attribute.positiveLabel : config.attribute.negativeLabel;
  return [config.concepts[block.conceptIdx].label, pole];
}

const KEY = { left: "E", right: "I" } as const;

const join = (xs: string[]) => xs.join(" o ");

export interface BlockIntro {
  title: string;
  body: string;
}

export function blockIntro(config: VariantConfig, plan: VariantPlan, block: AnyBlock, position: number, total: number, inputMode: InputMode): BlockIntro {
  const touch = inputMode === "touch";
  const part = `Parte ${position} de ${total}`;
  const kind = block.practice ? "Práctica" : "Prueba";

  if (config.variant === "gnat") {
    const b = block as GnatBlock;
    const targets = join(gnatTargets(config, b));
    const act = touch ? "toca el botón" : "presiona la barra espaciadora";
    const practiceNote = block.practice ? " Esta ronda es de práctica: aparecerá una X roja cuando te equivoques." : "";
    return {
      title: `${part} · ${kind}`,
      body: `Responde (${act}) SÓLO cuando veas una palabra de: ${targets}. Si es de otra categoría, no hagas nada. Cada palabra desaparece en menos de un segundo, así que responde rápido.${practiceNote}`,
    };
  }

  const labels = sideLabelsFor(config, plan, block);
  const where = (side: Side) => (touch ? (side === "left" ? "el botón izquierdo" : "el botón derecho") : `la tecla ${KEY[side]}`);
  const rule = labels
    ? `Para ${join(labels.left)} usa ${where("left")}. Para ${join(labels.right)} usa ${where("right")}.`
    : "";

  if (config.variant === "priming") {
    return {
      title: `${part} · ${kind}`,
      body: `Primero verás un nombre o símbolo muy breve; después, una palabra. Clasifica la PALABRA como buena o mala lo más rápido que puedas, sin equivocarte. ${rule}${block.practice ? " Esta ronda es de práctica: aparecerá una X roja cuando te equivoques." : ""}`,
    };
  }
  return {
    title: `${part} · ${kind}`,
    body: `${rule} Tienes poco tiempo para cada palabra: responde lo más rápido que puedas. Si te equivocas o no alcanzas a responder, verás una señal y la prueba sigue.`,
  };
}
