import Link from "next/link";

type TabKey = "overview" | "data" | "analysis" | "compare" | "ratings" | "results" | "report" | "settings";
interface Tab {
  key: TabKey;
  label: string;
  href: (id: string) => string;
}

const t = (key: TabKey, label: string, path = ""): Tab => ({ key, label, href: (id) => `/studies/${id}${path}` });

/** Pestañas por herramienta (y por modo, en la herramienta visual). */
const TABS = {
  iat: [t("overview", "Resumen"), t("data", "Datos", "/data"), t("analysis", "Análisis", "/analysis")],
  seo: [t("overview", "Auditorías"), t("settings", "Ajustes", "/settings")],
  pieces: [t("overview", "Piezas"), t("compare", "Comparativa", "/compare"), t("report", "Informe", "/report"), t("settings", "Ajustes", "/settings")],
  eye: [t("overview", "Piezas y enlace"), t("results", "Miradas", "/eye"), t("settings", "Ajustes", "/settings")],
  journey: [
    t("overview", "Capturas"),
    t("ratings", "Calificación", "/ratings"),
    t("results", "Resultados IFD", "/results"),
    t("report", "Informe", "/report"),
    t("settings", "Ajustes", "/settings"),
  ],
} satisfies Record<string, Tab[]>;

export type TabsVariant = keyof typeof TABS;

export function StudyTabs({ id, active, variant = "iat" }: { id: string; active: TabKey; variant?: TabsVariant }) {
  return (
    <nav aria-label="Secciones del estudio" className="flex gap-1 overflow-x-auto border-b border-border print:hidden">
      {TABS[variant].map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(id)}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-2.5 font-display text-sm font-semibold ${
            tab.key === active ? "border-primary text-heading" : "border-transparent text-muted hover:text-heading"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
