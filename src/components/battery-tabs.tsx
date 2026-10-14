import Link from "next/link";
import { Icon } from "@/components/brand/icon";

const TABS = [
  { key: "overview", label: "Resumen", icon: "layers", href: (id: string) => `/batteries/${id}` },
  { key: "results", label: "Informe integrado", icon: "results", href: (id: string) => `/batteries/${id}/results` },
] as const;

export function BatteryTabs({ id, active }: { id: string; active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Secciones de la batería" className="flex gap-1 overflow-x-auto border-b border-border print:hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(id)}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-[3px] px-4 py-2.5 font-display text-sm font-semibold ${
            tab.key === active ? "border-primary text-heading" : "border-transparent text-muted hover:text-heading"
          }`}
        >
          <Icon name={tab.icon} className="size-5" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
