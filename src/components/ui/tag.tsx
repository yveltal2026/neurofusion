import type { ReactNode } from "react";

/**
 * Etiqueta de marca (manual v4.1, cap. 12): una palabra corta con una burbuja delante, sin caja.
 * La burbuja va en el color de la familia: Neuro, dentro de esta plataforma.
 */
export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display font-semibold text-neuro-ink ${className}`}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-neuro" />
      {children}
    </span>
  );
}
