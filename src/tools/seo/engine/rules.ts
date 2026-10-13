import { RULES, type RuleId } from "./rules-catalog";
import type { FetchRecord, Finding, PageData, Severity } from "./types";
import { normalizeUrl } from "./url";

export function finding(rule: RuleId, severity: Severity, detail: string, url: string | null): Finding {
  const def = RULES[rule];
  return { rule, severity, category: def.category, element: def.element, detail, url };
}

const HREFLANG_RE = /^(x-default|[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?)$/i;

/** Quita acentos y pasa a minúsculas para comparar la palabra clave. */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface PageAuditOptions {
  targetKeyword?: string | null;
}

/**
 * Reglas on-page de una página. Cada regla aplicable emite exactamente un hallazgo
 * (CORRECTO incluido), así los conteos y la puntuación cuadran por construcción.
 */
export function auditPage(page: PageData, opts: PageAuditOptions = {}): Finding[] {
  const out: Finding[] = [];
  const u = page.url;
  const f = (rule: RuleId, sev: Severity, detail: string) => out.push(finding(rule, sev, detail, u));

  // ---- indexación
  const robots = (page.robotsMeta ?? "").toLowerCase();
  if (/\b(noindex|none)\b/.test(robots)) f("page.noindex", "critical", `La página pide no indexarse (meta robots: «${page.robotsMeta}»).`);
  else f("page.noindex", "ok", "La página es indexable (sin noindex en meta robots).");
  if (/\bnofollow\b/.test(robots)) f("page.nofollow", "medium", "meta robots incluye nofollow: no se siguen los enlaces de la página.");

  // ---- título
  const title = page.title;
  if (!title) f("title.present", "critical", "No hay etiqueta <title>.");
  else if (title.length < 25) f("title.present", "medium", `Título corto (${title.length} caracteres): «${title}».`);
  else if (title.length > 65) f("title.present", "medium", `Título largo (${title.length} caracteres); Google suele truncarlo: «${title}».`);
  else f("title.present", "ok", `«${title}» (${title.length} caracteres).`);

  // ---- meta description
  const desc = page.metaDescription;
  if (!desc) f("meta.description", "high", "No hay meta description (o está vacía).");
  else if (desc.length < 70) f("meta.description", "medium", `Descripción corta (${desc.length} caracteres).`);
  else if (desc.length > 160) f("meta.description", "medium", `Descripción larga (${desc.length} caracteres); se truncará.`);
  else f("meta.description", "ok", `${desc.length} caracteres.`);

  // ---- palabra clave
  const kw = opts.targetKeyword?.trim();
  if (kw) {
    const k = fold(kw);
    const where = [
      ["título", title],
      ["H1", page.h1.join(" ")],
      ["descripción", desc],
    ].filter(([, v]) => v && fold(v).includes(k)).map(([n]) => n);
    if (where.length === 0) f("keyword.usage", "medium", `«${kw}» no aparece en el título, el H1 ni la descripción.`);
    else if (where.length < 3) f("keyword.usage", "medium", `«${kw}» aparece sólo en: ${where.join(", ")}.`);
    else f("keyword.usage", "ok", `«${kw}» aparece en título, H1 y descripción.`);
  }

  // ---- canonical
  if (page.canonical === null) f("canonical", "medium", "No declara URL canónica.");
  else if (page.canonical === "") f("canonical", "high", "La etiqueta canonical está vacía.");
  else {
    const abs = /^https?:\/\//i.test(page.canonical);
    const target = normalizeUrl(page.canonical, u);
    if (!target) f("canonical", "high", `Canonical inválida: «${page.canonical}».`);
    else if (target !== normalizeUrl(u)) f("canonical", "medium", `Canonicaliza a otra URL (${target}); esta página no se indexará por sí misma.`);
    else if (!abs) f("canonical", "medium", "La canonical es relativa; usa una URL absoluta.");
    else f("canonical", "ok", "Canonical autorreferente.");
  }

  // ---- encabezados
  if (page.h1.length === 0) f("h1", "high", "No hay H1.");
  else if (page.h1.length > 1) f("h1", "medium", `Hay ${page.h1.length} H1.`);
  else f("h1", "ok", `«${page.h1[0]}».`);
  const jumps: string[] = [];
  for (let i = 1; i < page.headings.length; i++) {
    const prev = page.headings[i - 1].level;
    const cur = page.headings[i].level;
    if (cur > prev + 1) jumps.push(`H${prev}→H${cur}`);
  }
  if (page.headings.length) {
    if (jumps.length) f("headings.hierarchy", "medium", `Saltos de nivel: ${[...new Set(jumps)].join(", ")}.`);
    else f("headings.hierarchy", "ok", "Jerarquía de encabezados sin saltos.");
  }

  // ---- idioma, móvil
  if (!page.lang) f("html.lang", "medium", "<html> no declara lang.");
  else f("html.lang", "ok", `lang="${page.lang}".`);
  if (!page.viewport) f("viewport", "high", "Sin meta viewport: la página no está preparada para móvil.");
  else f("viewport", "ok", page.viewport);

  // ---- datos estructurados
  if (page.jsonLd.errors > 0) f("structured_data", "high", `${page.jsonLd.errors} bloque(s) JSON-LD con JSON inválido.`);
  else if (page.jsonLd.blocks === 0 || page.jsonLd.types.length === 0) f("structured_data", "high", "Sin datos estructurados JSON-LD.");
  else f("structured_data", "ok", `Tipos: ${page.jsonLd.types.join(", ")}.`);

  // ---- social
  const missingOg = ["og:title", "og:description", "og:image"].filter((k) => !page.og[k]);
  if (missingOg.length) f("open_graph", "medium", `Faltan: ${missingOg.join(", ")}.`);
  else f("open_graph", "ok", "og:title, og:description y og:image presentes.");

  // ---- hreflang (sólo si se usa)
  if (page.hreflang.length) {
    const problems: string[] = [];
    const bad = page.hreflang.filter((h) => !HREFLANG_RE.test(h.lang)).map((h) => h.lang);
    if (bad.length) problems.push(`códigos inválidos: ${bad.join(", ")}`);
    const self = normalizeUrl(u);
    if (!page.hreflang.some((h) => normalizeUrl(h.href, u) === self)) problems.push("no se refiere a sí misma");
    if (!page.hreflang.some((h) => h.lang.toLowerCase() === "x-default")) problems.push("falta x-default");
    if (problems.length) f("hreflang", "medium", `hreflang: ${problems.join("; ")}.`);
    else f("hreflang", "ok", `${page.hreflang.length} alternas declaradas.`);
  }

  // ---- imágenes
  if (page.images.total > 0) {
    const ratio = page.images.missingAlt / page.images.total;
    if (page.images.missingAlt === 0) f("images.alt", "ok", `${page.images.total} imágenes con atributo alt.`);
    else
      f(
        "images.alt",
        "medium",
        `${page.images.missingAlt} de ${page.images.total} imágenes sin atributo alt (${Math.round(ratio * 100)} %).`,
      );
  }

  // ---- contenido
  if (page.wordCount < 150) f("content.thin", "medium", `Sólo ${page.wordCount} palabras de texto visible (HTML recibido, sin ejecutar JavaScript).`);
  else f("content.thin", "ok", `${page.wordCount} palabras.`);

  if (page.mixedContent > 0) f("mixed_content", "medium", `${page.mixedContent} recurso(s) cargados por http:// en una página https://.`);

  return out;
}

/** Reglas sobre la respuesta HTTP de una URL rastreada. */
export function auditFetch(rec: FetchRecord): Finding[] {
  const out: Finding[] = [];
  const u = rec.url;
  if (rec.error || rec.status === null) out.push(finding("page.reachable", "critical", `No se pudo descargar: ${rec.error ?? "sin respuesta"}.`, u));
  else if (rec.status >= 400) out.push(finding("page.reachable", "critical", `Responde ${rec.status}.`, u));
  else out.push(finding("page.reachable", "ok", `Responde ${rec.status}.`, u));

  if (rec.redirects.length > 1) out.push(finding("page.redirect_chain", "medium", `Cadena de ${rec.redirects.length} redirecciones hasta ${rec.finalUrl}.`, u));

  if (rec.timeMs !== null && rec.status !== null && rec.status < 400) {
    if (rec.timeMs > 5000) out.push(finding("page.response_time", "high", `${(rec.timeMs / 1000).toFixed(1)} s hasta recibir el HTML.`, u));
    else if (rec.timeMs > 2000) out.push(finding("page.response_time", "medium", `${(rec.timeMs / 1000).toFixed(1)} s hasta recibir el HTML.`, u));
    else out.push(finding("page.response_time", "ok", `${rec.timeMs} ms hasta recibir el HTML.`, u));
  }

  if (rec.xRobotsTag && /\b(noindex|none)\b/i.test(rec.xRobotsTag)) {
    out.push(finding("page.noindex", "critical", `La cabecera X-Robots-Tag pide no indexar («${rec.xRobotsTag}»).`, u));
  }
  return out;
}
