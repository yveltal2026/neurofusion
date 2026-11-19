import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/icon";

type TabKey = "overview" | "sessions" | "data" | "analysis" | "compare" | "ratings" | "results" | "report" | "settings" | "responses";
interface Tab {
  key: TabKey;
  label: string;
  icon: IconName;
  href: (id: string) => string;
}

const ICONS: Record<TabKey, IconName> = {
  overview: "layers",
  data: "table",
  sessions: "table",
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
  survey: [t("overview", "Resumen"), t("report", "Informe y resultados", "/report")],
  variant: [t("overview", "Resumen"), t("responses", "Resultados", "/responses")],
  seo: [t("overview", "Auditorías"), t("settings", "Ajustes", "/settings")],
  pieces: [
    t("overview", "Piezas"),
    t("compare", "Comparativa", "/compare"),
    t("report", "Informe", "/report"),
    t("settings", "Ajustes", "/settings"),
  ],
  eye: [
    t("overview", "Resumen"),
    t("results", "Miradas", "/eye"),
    t("sessions", "Sesiones", "/eye?view=sessions"),
    t("report", "Informe", "/report"),
    t("settings", "Ajustes", "/settings"),
  ],
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
    <nav aria-label="Secciones del estudio" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface-muted p-1 print:hidden">
      {TABS[variant].map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(id)}
          aria-current={tab.key === active ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2 motion-reduce:transition-none ${
            tab.key === active ? "bg-surface text-heading shadow-xs" : "text-muted hover:bg-surface hover:text-heading"
          }`}
        >
          <Icon name={tab.icon} className="size-5" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
