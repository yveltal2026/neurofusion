import type { ReactNode } from "react";
import type { IconName } from "@/components/brand/icon";
import { IconTile } from "./icon-tile";

/** Estado vacío que enseña el siguiente paso: icono, qué falta y, si aplica, la acción que lo resuelve. */
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neuro/40 bg-neuro-wash px-6 py-10 text-center">
      <IconTile name={icon} size="lg" />
      <h2 className="text-xl font-semibold">{title}</h2>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
