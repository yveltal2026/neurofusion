import type { HTMLAttributes } from "react";

/** Contenedor con borde: sólo cuando agrupa una acción o un dato que debe leerse como una unidad. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-border bg-surface p-5 ${className}`} {...props} />;
}

/**
 * Bloque abierto (manual v4.1, cap. 11: «bloques abiertos sin cajas»): se separa del anterior con un
 * filete y aire, no con una caja. Es el contenedor por defecto de las secciones de una pantalla.
 */
export function Block({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`border-t border-border pt-8 ${className}`} {...props} />;
}

/** Un solo panel tintado para la acción principal de la pantalla (p. ej. la liga que se comparte). */
export function Panel({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-lg bg-neuro-wash p-5 ${className}`} {...props} />;
}
