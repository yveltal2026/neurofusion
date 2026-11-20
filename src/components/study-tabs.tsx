import Link from "next/link";

const TABS = [
  { key: "overview", label: "Resumen", href: (id: string) => `/studies/${id}` },
  { key: "data", label: "Datos", href: (id: string) => `/studies/${id}/data` },
  { key: "analysis", label: "Análisis", href: (id: string) => `/studies/${id}/analysis` },
  { key: "settings", label: "Ajustes", href: (id: string) => `/studies/${id}/settings` },
] as const;

export function StudyTabs({ id, active }: { id: string; active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Secciones del estudio" className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(id)}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            t.key === active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
