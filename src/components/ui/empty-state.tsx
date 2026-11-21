import type { ReactNode } from "react";
import type { IconName } from "@/components/brand/icon";
import { IconTile } from "./icon-tile";

/** Estado vacío que enseña el siguiente paso: icono, qué falta y, si aplica, la acción que lo resuelve. */
export function EmptyState({
  icon,
  title,
  headingLevel = "h2",
  children,
  action,
}: {
  icon: IconName;
  title: string;
  headingLevel?: "h2" | "h3";
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-accent-ink/25 bg-surface-muted/45 px-6 py-10 text-center">
      <IconTile name={icon} size="lg" />
      <Heading className="text-xl font-semibold">{title}</Heading>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
