/**
 * Tipos del motor SEO. Todo el motor es código puro (sin red ni BD): recibe HTML,
 * robots.txt, sitemaps y respuestas de PageSpeed ya descargados y devuelve hallazgos.
 */

/** CRÍTICO / GRAVE / MEJORABLE / CORRECTO (escala heredada de NeuroSEO). */
export type Severity = "critical" | "high" | "medium" | "ok";

export type Category =
  | "rastreo"
  | "indexacion"
  | "contenido"
  | "estructura"
  | "datos_estructurados"
  | "social"
  | "imagenes"
  | "enlaces"
  | "internacional"
  | "movil"
  | "rendimiento"
  | "seguridad";

export interface Finding {
  rule: string;
  severity: Severity;
  category: Category;
  /** Elemento revisado, legible (p. ej. "<title>"). */
  element: string;
  detail: string;
  /** URL de la página; null para hallazgos de todo el sitio. */
  url: string | null;
  /** Observación contextual: visible, pero no resta puntos ni confirma un error. */
  advisory?: boolean;
}

export interface PageData {
  url: string;
  documentUrl?: string;
  expectedIndexable?: boolean;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  canonicalDeclarations?: string[];
  robotsMeta: string | null;
  lang: string | null;
  viewport: string | null;
  h1: string[];
  headings: { level: number; text: string }[];
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  jsonLd: {
    blocks: number;
    errors: number;
    types: string[];
    issues?: string[];
  };
  images: { total: number; missingAlt: number };
  links: { internal: string[]; external: number; nofollow: number };
  wordCount: number;
  /** Recursos http:// cargados desde una página https://. */
  mixedContent: number;
}

/** Resultado de descargar una URL (lo produce el rastreador; el motor sólo lo lee). */
export interface FetchRecord {
  url: string;
  finalUrl: string;
  status: number | null;
  redirects: string[];
  timeMs: number | null;
  contentType: string | null;
  xRobotsTag: string | null;
  error: string | null;
}

export interface PageSummary {
  url: string;
  finalUrl: string;
  status: number | null;
  timeMs: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  wordCount: number | null;
  internalLinks: number | null;
  source: "live" | "upload";
  target?: { keyword: string | null; goal: string; indexable: boolean };
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  ok: number;
}

export interface AuditSummary {
  counts: SeverityCounts;
  /** 0–100, heurística versionada (ver SCORE_VERSION). */
  score: number;
  scoreVersion: string;
  byCategory: { category: Category; score: number; failing: number }[];
  pagesAudited: number;
  advisoryCount?: number;
  scoredChecks?: number;
  coverage?: {
    requestedPages: number;
    htmlPages: number;
    httpChecks: number;
    sitemapUrls: number;
    sitemapChecked: number;
    blockedUrls: number;
    stopReason:
      "complete" | "page_limit" | "time_limit" | "fetch_limit" | "upload";
    performanceRequested: boolean;
    performanceMeasured: boolean;
  };
  /** Configuración efectiva al ejecutar; no se toma de ajustes posteriores. */
  scope?: {
    targetKeyword: string | null;
    pageTargets: import("../config").PageTarget[];
    strategy: "mobile" | "desktop" | null;
  };
}

export interface PerformanceResult {
  strategy: "mobile" | "desktop";
  url: string;
  performanceScore: number | null;
  /** Categoría SEO de Lighthouse (1 página, ya renderizada). Opcional: auditorías anteriores no la tienen. */
  lighthouseSeoScore?: number | null;
  lab: {
    lcpMs: number | null;
    cls: number | null;
    tbtMs: number | null;
    fcpMs: number | null;
    speedIndexMs: number | null;
  };
  /** Datos de campo (CrUX). null si el sitio no tiene tráfico suficiente. */
  field: {
    lcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    category: string | null;
  } | null;
  opportunities: { id: string; title: string; savingsMs: number }[];
}
