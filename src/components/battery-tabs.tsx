import Link from "next/link";

const tabs = [
  ["overview", "Resumen", ""],
  ["results", "Resultados", "/report"],
  ["analysis", "Análisis", "/analysis"],
] as const;
export function BatteryTabs({
  id,
  active,
}: {
  id: string;
  active: "overview" | "results" | "analysis";
}) {
  return (
    <nav
      aria-label="Secciones de la batería"
      className="flex gap-1 overflow-x-auto border-b border-border print:hidden"
    >
      {tabs.map(([key, label, path]) => (
        <Link
          key={key}
          href={`/batteries/${id}${path}`}
          aria-current={active === key ? "page" : undefined}
          className={`whitespace-nowrap border-b-[3px] px-4 py-2.5 text-sm font-semibold ${active === key ? "border-primary bg-neuro/10 text-neuro-ink" : "border-transparent text-muted hover:text-foreground"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
