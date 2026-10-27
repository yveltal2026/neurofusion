import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "@/components/brand/icon";

/**
 * Botón sólo de icono (mover, duplicar, quitar). El nombre accesible y el tooltip son `label`.
 * «onBand» es la versión para fondos teal profundo (la cabecera de un bloque).
 */
export function IconButton({
  icon,
  label,
  rotate,
  onBand = false,
  className = "",
  ...props
}: Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "title" | "aria-label"
> & {
  icon: IconName;
  label: string;
  /** Giro del icono en grados (el chevron mira hacia abajo por defecto). */
  rotate?: 180;
  onBand?: boolean;
}) {
  const tone = onBand
    ? "text-background hover:bg-background/15 focus-visible:outline-background"
    : "text-heading hover:bg-heading/10";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full transition duration-150 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent motion-reduce:transition-none ${tone} ${className}`}
      {...props}
    >
      <Icon
        name={icon}
        className={`size-5 ${rotate === 180 ? "rotate-180" : ""}`}
      />
    </button>
  );
}
