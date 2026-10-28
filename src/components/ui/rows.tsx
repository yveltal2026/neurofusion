import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/brand/icon";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconName } from "@/components/brand/icon";

/** Lista de filas separadas por filetes (sin una caja por elemento). */
export function RowList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-border border-y border-border ${className}`}>{children}</ul>;
}

/**
 * Fila de lista que lleva a otra pantalla: icono, título, apoyo opcional y un dato a la derecha.
 * La flecha final dice que es un enlace; al pasar el cursor, un fondo suave de Neuro.
 */
export function RowLink({
  href,
  icon,
  title,
  description,
  meta,
}: {
  href: string;
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-4 px-2 py-4 transition-colors duration-150 hover:bg-neuro-wash motion-reduce:transition-none sm:px-3">
        {icon ? <IconTile name={icon} size="md" /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-semibold text-heading">{title}</span>
          {description ? <span className="mt-0.5 block text-sm text-muted">{description}</span> : null}
        </span>
        {meta ? <span className="hidden shrink-0 items-center gap-2 text-sm text-muted sm:flex">{meta}</span> : null}
        <Icon name="arrow" className="size-5 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-neuro-ink motion-reduce:transition-none" />
      </Link>
    </li>
  );
}
