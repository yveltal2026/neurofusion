import { finding } from "./rules";
import { isAllowed, type ParsedRobots } from "./robots";
import type { FetchRecord, Finding, PageData } from "./types";
import { normalizeUrl } from "./url";

/** Cruces basados exclusivamente en respuestas y HTML ya descargados. */
export function auditTechnical(
  pages: PageData[],
  fetches: FetchRecord[],
  sitemapUrls: string[] = [],
  robots: ParsedRobots | null = null,
  robotsOrigin?: string,
): Finding[] {
  const out: Finding[] = [];
  const data = new Map<string, PageData>();
  const responses = new Map<string, FetchRecord>();
  for (const page of pages) {
    data.set(page.url, page);
    data.set(page.documentUrl ?? page.url, page);
  }
  for (const rec of fetches) responses.set(rec.url, rec);
  const excluded = (page: PageData | undefined, rec?: FetchRecord) =>
    /\b(noindex|none)\b/i.test(
      [page?.robotsMeta, rec?.xRobotsTag].filter(Boolean).join(", "),
    );

  for (const page of pages) {
    const base = page.documentUrl ?? page.url;
    const declarations =
      page.canonicalDeclarations ??
      (page.canonical === null ? [] : [page.canonical]);
    const canonical = normalizeUrl(page.canonical ?? "", base);
    if (new Set(declarations.map((c) => normalizeUrl(c, base) ?? c)).size > 1)
      out.push(
        finding(
          "canonical.conflict",
          "high",
          `El HTML contiene canónicas contradictorias: ${declarations.slice(0, 5).join(", ")}.`,
          page.url,
        ),
      );
    else if (declarations.length)
      out.push(
        finding(
          "canonical.conflict",
          "ok",
          "No hay destinos canónicos contradictorios en el HTML.",
          page.url,
        ),
      );

    if (page.canonical && canonical && page.expectedIndexable !== false) {
      const target = data.get(canonical);
      const rec =
        responses.get(canonical) ??
        fetches.find(
          (f) => f.finalUrl === canonical && f.status === 200 && !f.error,
        );
      const chained = target?.canonical
        ? normalizeUrl(target.canonical, target.documentUrl ?? target.url)
        : null;
      if (rec && !rec.error && rec.status !== null && rec.status >= 400)
        out.push(
          finding(
            "canonical.target",
            "high",
            `La canónica apunta a ${canonical}, que respondió ${rec.status}.`,
            page.url,
          ),
        );
      else if (excluded(target, rec))
        out.push(
          finding(
            "canonical.target",
            "high",
            `La canónica apunta a ${canonical}, donde se detectó noindex.`,
            page.url,
          ),
        );
      else if (rec?.redirects.length)
        out.push(
          finding(
            "canonical.target",
            "medium",
            `El destino canónico ${canonical} redirige a ${rec.finalUrl}.`,
            page.url,
          ),
        );
      else if (chained && chained !== canonical)
        out.push(
          finding(
            "canonical.target",
            "high",
            `Cadena de canónicas: ${canonical} declara ${chained}.`,
            page.url,
          ),
        );
      else if (rec?.status === 200 && !rec.error && target)
        out.push(
          finding(
            "canonical.target",
            "ok",
            `Destino ${canonical}: HTTP 200 y sin noindex detectado. Esto no confirma indexación en Google.`,
            page.url,
          ),
        );
      else
        out.push(
          finding(
            "canonical.target",
            "medium",
            `No se pudo verificar por completo el destino ${canonical} dentro de esta muestra.`,
            page.url,
            true,
          ),
        );
    }

    const checked: string[] = [];
    const missing: string[] = [];
    for (const alternate of page.hreflang) {
      const url = normalizeUrl(alternate.href, base);
      if (!url || url === base || alternate.lang.toLowerCase() === "x-default")
        continue;
      const other = data.get(url);
      if (!other) continue;
      checked.push(url);
      if (
        !other.hreflang.some(
          (h) =>
            normalizeUrl(h.href, other.documentUrl ?? other.url) ===
            normalizeUrl(base),
        )
      )
        missing.push(url);
    }
    if (checked.length)
      out.push(
        finding(
          "hreflang.return",
          missing.length ? "medium" : "ok",
          missing.length
            ? `Sin enlace hreflang de retorno desde: ${[...new Set(missing)].slice(0, 5).join(", ")}.`
            : `Reciprocidad verificada en ${new Set(checked).size} destino(s) descargado(s).`,
          page.url,
        ),
      );
  }

  for (const raw of new Set(sitemapUrls)) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    const page = data.get(url);
    const rec = responses.get(url);
    const blocked =
      robots &&
      new URL(url).origin === robotsOrigin &&
      !isAllowed(
        robots,
        new URL(url).pathname + new URL(url).search,
        "Googlebot",
      );
    const canonical = page?.canonical
      ? normalizeUrl(page.canonical, page.documentUrl ?? page.url)
      : null;
    let problem: string | null = null;
    if (blocked) problem = "bloqueada para Googlebot en el robots.txt revisado";
    else if (rec && !rec.error && rec.status !== null && rec.status >= 400)
      problem = `HTTP ${rec.status}`;
    else if (excluded(page, rec)) problem = "directiva noindex detectada";
    else if (rec?.redirects.length) problem = `redirige a ${rec.finalUrl}`;
    else if (canonical && canonical !== url)
      problem = `declara otra canónica: ${canonical}`;
    if (problem)
      out.push(
        finding(
          "sitemap.indexability",
          "high",
          `URL incluida en sitemap: ${problem}.`,
          url,
        ),
      );
    else if (page && rec?.status === 200 && !rec.error)
      out.push(
        finding(
          "sitemap.indexability",
          "ok",
          "URL del sitemap con HTTP 200, sin noindex ni canónica hacia otra página detectados.",
          url,
        ),
      );
  }
  return out;
}
