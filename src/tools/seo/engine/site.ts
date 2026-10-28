import { finding } from "./rules";
import type { FetchRecord, Finding, PageData } from "./types";
import { normalizeUrl } from "./url";

const list = (xs: string[], max = 5) =>
  xs.slice(0, max).join(", ") +
  (xs.length > max ? ` y ${xs.length - max} más` : "");

/** Hallazgos por URL; la ausencia de duplicados se limita a la muestra revisada. */
export function auditSite(
  pages: PageData[],
  fetches: FetchRecord[],
): Finding[] {
  const out: Finding[] = [];
  const htmlPages = pages.filter((p) => {
    const rec = fetches.find((f) => f.url === p.url);
    return !rec || (rec.status === 200 && !rec.error);
  });
  if (htmlPages.length > 1) {
    for (const page of htmlPages) {
      for (const [rule, value, pick] of [
        ["site.duplicate_titles", page.title, (p: PageData) => p.title],
        [
          "site.duplicate_descriptions",
          page.metaDescription,
          (p: PageData) => p.metaDescription,
        ],
      ] as const) {
        if (!value) continue;
        const others = htmlPages
          .filter((p) => p.url !== page.url && pick(p) === value)
          .map((p) => p.url);
        out.push(
          finding(
            rule,
            others.length ? "medium" : "ok",
            others.length
              ? `«${value}» también aparece en: ${list(others)}.`
              : "Sin duplicados de este texto en las otras páginas de la muestra.",
            page.url,
          ),
        );
      }
    }
  }
  const responses = new Map(fetches.map((f) => [normalizeUrl(f.url), f]));
  for (const page of pages) {
    const broken: string[] = [];
    const redirected: string[] = [];
    let checked = 0;
    let unverified = 0;
    for (const url of page.links.internal) {
      const rec = responses.get(url);
      if (!rec) continue;
      if (rec.error || rec.status === null) {
        unverified++;
        continue;
      }
      checked++;
      if (rec.status >= 400) broken.push(`${url} (${rec.status})`);
      else if (rec.redirects.length) redirected.push(url);
    }
    if (checked > 0 || page.links.internal.length === 0) {
      out.push(
        finding(
          "site.broken_links",
          broken.length ? "high" : "ok",
          broken.length
            ? `Destinos internos con error: ${list(broken)}.`
            : `Sin enlaces internos rotos entre los ${checked} destinos con estado verificado.`,
          page.url,
          !broken.length && checked < page.links.internal.length,
        ),
      );
      out.push(
        finding(
          "site.redirected_links",
          redirected.length ? "medium" : "ok",
          redirected.length
            ? `Enlaces que redirigen: ${list(redirected)}.`
            : `Sin redirecciones entre los ${checked} destinos con estado verificado.`,
          page.url,
          !redirected.length && checked < page.links.internal.length,
        ),
      );
    }
    if (unverified)
      out.push(
        finding(
          "site.broken_links",
          "medium",
          `${unverified} destino(s) no pudieron comprobarse por error de red. No se confirma que estén rotos.`,
          page.url,
          true,
        ),
      );
  }
  return out;
}
