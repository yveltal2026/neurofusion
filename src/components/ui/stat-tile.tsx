import type { IconName } from "@/components/brand/icon";
import { IconTile } from "./icon-tile";

/** Cifra destacada (manual, cap. 12): número en Poppins y la etiqueta debajo, con su icono. */
export function StatTile({ icon, label, value }: { icon: IconName; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <IconTile name={icon} size="sm" />
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-none text-heading tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}
