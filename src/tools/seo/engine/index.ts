export * from "./types";
export { RULES, ruleDef, type RuleId } from "./rules-catalog";
export { auditPage, auditFetch, finding, fold } from "./rules";
export { extractPageData } from "./html";
export { parseRobots, isAllowed, auditRobots, type ParsedRobots } from "./robots";
export { parseSitemap, auditSitemaps, type FetchedSitemap } from "./sitemap";
export { auditSite } from "./site";
export { parsePsi, auditPerformance } from "./psi";
export { consolidate, summarize, sortFindings, countBySeverity, SCORE_VERSION, SEVERITY_ORDER } from "./summary";
export { normalizeUrl, isSameSite, siteHost, originOf } from "./url";
export { SEVERITY_LABEL, CATEGORY_LABEL } from "./labels";

/** Versión del motor SEO (reglas + umbrales). Se guarda con cada auditoría. */
export const ENGINE_VERSION = "nf-seo-1.0";
