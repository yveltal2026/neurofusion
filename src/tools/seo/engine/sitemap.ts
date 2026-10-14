import * as cheerio from "cheerio";
import { finding } from "./rules";
import type { Finding } from "./types";

export interface ParsedSitemap {
  kind: "urlset" | "index" | "unknown";
  entries: { loc: string; lastmod: string | null }[];
}

export function parseSitemap(xml: string): ParsedSitemap {
  const $ = cheerio.load(xml, { xml: true });
  const isIndex = $("sitemapindex").length > 0;
  const isSet = $("urlset").length > 0;
  const sel = isIndex ? "sitemapindex > sitemap" : "urlset > url";
  const entries = $(sel)
    .toArray()
    .map((el) => ({ loc: $(el).children("loc").first().text().trim(), lastmod: $(el).children("lastmod").first().text().trim() || null }))
    .filter((e) => e.loc);
  return { kind: isIndex ? "index" : isSet ? "urlset" : "unknown", entries };
}

export interface FetchedSitemap {
  url: string;
  /** null = no se pudo descargar. */
  xml: string | null;
  status: number | null;
}

const DAY = 86_400_000;

/** Revisa accesibilidad y frescura de los sitemaps descargados. */
export function auditSitemaps(fetched: FetchedSitemap[], now: Date): { findings: Finding[]; urls: string[] } {
  const findings: Finding[] = [];
  const urls: string[] = [];
  let newest: number | null = null;
  let withLastmod = 0;
  let total = 0;

  for (const s of fetched) {
    if (s.xml === null) {
      findings.push(finding("sitemap.reachable", "high", `${s.url} no accesible (${s.status ?? "sin respuesta"}).`, null));
      continue;
    }
    const parsed = parseSitemap(s.xml);
    if (parsed.kind === "unknown") {
      findings.push(finding("sitemap.reachable", "high", `${s.url} no es un sitemap XML válido.`, null));
      continue;
    }
    if (parsed.entries.length === 0) {
      findings.push(finding("sitemap.reachable", "high", `${s.url} está vacío.`, null));
      continue;
    }
    findings.push(
      finding("sitemap.reachable", "ok", `${s.url}: ${parsed.entries.length} ${parsed.kind === "index" ? "sitemaps hijos" : "URLs"}.`, null),
    );
    for (const e of parsed.entries) {
      total++;
      if (parsed.kind === "urlset") urls.push(e.loc);
      const t = e.lastmod ? Date.parse(e.lastmod) : NaN;
      if (Number.isFinite(t)) {
        withLastmod++;
        newest = newest === null ? t : Math.max(newest, t);
      }
    }
  }

  if (total > 0) {
    if (withLastmod === 0) findings.push(finding("sitemap.freshness", "medium", "Ninguna entrada declara <lastmod>.", null));
    else if (newest !== null) {
      const days = Math.floor((now.getTime() - newest) / DAY);
      const date = new Date(newest).toISOString().slice(0, 10);
      if (days > 365) findings.push(finding("sitemap.freshness", "high", `El <lastmod> más reciente es ${date} (hace ${days} días): el sitemap parece abandonado.`, null));
      else findings.push(finding("sitemap.freshness", "ok", `El <lastmod> más reciente es ${date}.`, null));
    }
  }
  return { findings, urls };
}
