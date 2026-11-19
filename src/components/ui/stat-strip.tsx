import type { IconName } from "@/components/brand/icon";
import { Icon } from "@/components/brand/icon";

export function StatStrip({ items }: { items: { icon: IconName; label: string; value: number | string; attention?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 rounded-lg border border-border bg-surface/80 p-3 sm:p-4">
          <dt className="mb-2 flex items-center gap-1.5 text-sm text-muted">
            <Icon name={it.icon} className="size-4 shrink-0" />
            <span className="min-w-0">{it.label}</span>
          </dt>
          <dd className={`text-3xl font-extrabold leading-none tabular-nums ${it.attention && Number(it.value) > 0 ? "text-accent-ink" : "text-heading"}`}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
