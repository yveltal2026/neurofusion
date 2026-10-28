import type { IconName } from "@/components/brand/icon";
import { Icon } from "@/components/brand/icon";

/**
 * Cifras de resumen en una sola franja (no una caja por dato): número en Poppins y su etiqueta, con un
 * icono pequeño. `attention` resalta en morado la cifra que pide revisión cuando es mayor que cero.
 */
export function StatStrip({ items }: { items: { icon: IconName; label: string; value: number | string; attention?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dd className={`font-display text-2xl font-bold leading-none tabular-nums ${it.attention && Number(it.value) > 0 ? "text-neuro-ink" : "text-heading"}`}>
            {it.value}
          </dd>
          <dt className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <Icon name={it.icon} className="size-4 shrink-0" />
            <span className="min-w-0">{it.label}</span>
          </dt>
        </div>
      ))}
    </dl>
  );
}
