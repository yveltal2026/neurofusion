import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icon";

/** Título de sección con icono (h2). */
export function SectionTitle({ icon, children, className = "" }: { icon: IconName; children: ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2.5 text-xl font-semibold ${className}`}>
      <Icon name={icon} className="size-7" />
      {children}
    </h2>
  );
}
