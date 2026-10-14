import * as cheerio from "cheerio";
import type { PageData } from "./types";
import { isSameSite, normalizeUrl } from "./url";

const clean = (s: string | undefined | null) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length ? t : null;
};

/** Recorre un valor JSON-LD y junta todos los @type (incluye @graph y nodos anidados). */
function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x);
  for (const [k, v] of Object.entries(obj)) if (k !== "@context") collectTypes(v, out, depth + 1);
}

/** Extrae del HTML todo lo que necesitan las reglas. Función pura. */
export function extractPageData(url: string, html: string): PageData {
  const $ = cheerio.load(html);
  const baseHref = $("base[href]").attr("href");
  const base = (baseHref && normalizeUrl(baseHref, url)) || url;

  const meta = (name: string) => clean($(`meta[name="${name}" i]`).attr("content"));

  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => ({ level: Number(el.tagName.slice(1)), text: clean($(el).text()) ?? "" }));

  const og: Record<string, string> = {};
  $('meta[property^="og:" i]').each((_, el) => {
    const p = $(el).attr("property")?.toLowerCase();
    const c = clean($(el).attr("content"));
    if (p && c && !(p in og)) og[p] = c;
  });

  let blocks = 0;
  let errors = 0;
  const types = new Set<string>();
  $('script[type="application/ld+json" i]').each((_, el) => {
    blocks++;
    try {
      collectTypes(JSON.parse($(el).text()), types);
    } catch {
      errors++;
    }
  });

  const imgs = $("img").toArray();
  const missingAlt = imgs.filter((el) => $(el).attr("alt") === undefined).length;

  const internal = new Set<string>();
  let external = 0;
  let nofollow = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    const abs = normalizeUrl(href, base);
    if (!abs) return;
    if (/\bnofollow\b/i.test($(el).attr("rel") ?? "")) nofollow++;
    if (isSameSite(abs, url)) internal.add(abs);
    else external++;
  });

  let mixedContent = 0;
  if (url.startsWith("https:")) {
    $("img[src], script[src], link[rel=stylesheet][href], iframe[src], video[src], audio[src], source[src]").each((_, el) => {
      const v = $(el).attr("src") ?? $(el).attr("href") ?? "";
      if (/^http:\/\//i.test(v)) mixedContent++;
    });
  }

  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  const text = body.text().replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;

  const canonicalHref = $('link[rel~="canonical" i]').first().attr("href");

  return {
    url,
    title: clean($("head title").first().text()) ?? clean($("title").first().text()),
    metaDescription: meta("description"),
    canonical: canonicalHref === undefined ? null : (clean(canonicalHref) ?? ""),
    robotsMeta: [meta("robots"), meta("googlebot")].filter(Boolean).join(", ") || null,
    lang: clean($("html").attr("lang")),
    viewport: meta("viewport"),
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    headings,
    hreflang: $('link[rel~="alternate" i][hreflang]')
      .toArray()
      .map((el) => ({ lang: ($(el).attr("hreflang") ?? "").trim(), href: ($(el).attr("href") ?? "").trim() })),
    og,
    jsonLd: { blocks, errors, types: [...types].sort() },
    images: { total: imgs.length, missingAlt },
    links: { internal: [...internal], external, nofollow },
    wordCount,
    mixedContent,
  };
}
