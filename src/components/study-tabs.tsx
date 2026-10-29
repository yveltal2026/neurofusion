import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/icon";

type TabKey = "overview" | "data" | "analysis" | "compare" | "ratings" | "results" | "report" | "settings" | "responses";
interface Tab {
  key: TabKey;
  label: string;
  icon: IconName;
  href: (id: string) => string;
}

const ICONS: Record<TabKey, IconName> = {
  overview: "layers",
  data: "table",
  analysis: "results",
  compare: "target",
  ratings: "flag",
  results: "results",
  report: "survey",
  settings: "settings",
  responses: "table",
};

const t = (key: TabKey, label: string, path = ""): Tab => ({ key, label, icon: ICONS[key], href: (id) => `/studies/${id}${path}` });

/** Pestañas por herramienta (y por modo, en la herramienta visual). */
const TABS = {
  iat: [t("overview", "Resumen"), t("data", "Datos", "/data"), t("analysis", "Análisis", "/analysis")],
  survey: [t("overview", "Resumen"), t("responses", "Resultados", "/responses"), t("analysis", "Análisis", "/analysis")],
  variant: [t("overview", "Resumen"), t("responses", "Resultados", "/responses")],
  seo: [t("overview", "Auditorías"), t("settings", "Ajustes", "/settings")],
  pieces: [
    t("overview", "Piezas"),
    t("compare", "Comparativa", "/compare"),
    t("report", "Informe", "/report"),
    t("settings", "Ajustes", "/settings"),
  ],
  eye: [t("overview", "Piezas y enlace"), t("results", "Miradas", "/eye"), t("analysis", "Análisis", "/analysis"), t("settings", "Ajustes", "/settings")],
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
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-[3px] px-4 py-2.5 font-display text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${
            tab.key === active ? "border-primary bg-neuro/10 text-neuro-ink" : "border-transparent text-muted hover:bg-neuro/5 hover:text-neuro-ink"
          }`}
        >
          <Icon name={tab.icon} className="size-5" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
