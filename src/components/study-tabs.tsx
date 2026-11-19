import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/icon";
import { getStudyTool } from "@/tools/registry";

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

export function studyTabsVariant(study: { tool_type: string; config: unknown }): TabsVariant {
  switch (getStudyTool(study)?.type) {
    case "eyetracking": return "eye";
    case "iat_variant": return "variant";
    case "survey": return "survey";
    case "seo": return "seo";
    case "visual": {
      const config = study.config;
      return config !== null && typeof config === "object" && "mode" in config && config.mode === "journey"
        ? "journey"
        : "pieces";
    }
    default: return "iat";
  }
}

export function studyTabForRoute(section: string | undefined, view?: string): TabKey {
  switch (section) {
    case "eye": return view === "sessions" ? "sessions" : "results";
    case "data":
    case "analysis":
    case "compare":
    case "ratings":
    case "results":
    case "report":
    case "settings":
    case "responses": return section;
    default: return "overview";
  }
}

export function StudyTabs({ id, active, variant = "iat" }: { id: string; active: TabKey; variant?: TabsVariant }) {
  return (
    <nav aria-label="Secciones del estudio" className="space-y-0.5">
      {TABS[variant].map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(id)}
          aria-current={tab.key === active ? "page" : undefined}
          className="workspace-nav-link"
        >
          <Icon name={variant === "eye" && tab.key === "results" ? "eye" : tab.icon} className="size-5" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
