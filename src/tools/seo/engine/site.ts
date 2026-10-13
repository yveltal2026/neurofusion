import { finding } from "./rules";
import type { FetchRecord, Finding, PageData } from "./types";
import { normalizeUrl } from "./url";

const list = (xs: string[], max = 5) => xs.slice(0, max).join(", ") + (xs.length > max ? ` y ${xs.length - max} más` : "");

/** Reglas que comparan páginas entre sí (duplicados, enlaces rotos o redirigidos). */
export function auditSite(pages: PageData[], fetches: FetchRecord[]): Finding[] {
  const out: Finding[] = [];

  const dup = (pick: (p: PageData) => string | null) => {
    const by = new Map<string, string[]>();
    for (const p of pages) {
      const v = pick(p);
      if (!v) continue;
      by.set(v, [...(by.get(v) ?? []), p.url]);
    }
    return [...by.entries()].filter(([, urls]) => urls.length > 1);
  };

  if (pages.length > 1) {
    const t = dup((p) => p.title);
    if (t.length) out.push(finding("site.duplicate_titles", "medium", t.map(([v, u]) => `«${v}» en ${u.length} páginas (${list(u, 3)})`).join(" · "), null));
    else out.push(finding("site.duplicate_titles", "ok", "Sin títulos duplicados entre las páginas revisadas.", null));
    const d = dup((p) => p.metaDescription);
    if (d.length) out.push(finding("site.duplicate_descriptions", "medium", `${d.length} descripción(es) repetida(s) en varias páginas.`, null));
    else out.push(finding("site.duplicate_descriptions", "ok", "Sin descripciones duplicadas entre las páginas revisadas.", null));
  }

  // Enlaces internos hacia URLs cuyo estado conocemos.
  const status = new Map<string, FetchRecord>();
  for (const f of fetches) {
    const k = normalizeUrl(f.url);
    if (k) status.set(k, f);
  }
  const broken = new Set<string>();
  const redirected = new Set<string>();
  let checked = 0;
  for (const p of pages) {
    for (const l of p.links.internal) {
      const rec = status.get(l);
      if (!rec) continue;
      checked++;
      if (rec.error || rec.status === null || rec.status >= 400) broken.add(`${l} (${rec.status ?? "error"})`);
      else if (rec.redirects.length > 0) redirected.add(l);
    }
  }
  if (checked > 0) {
    if (broken.size) out.push(finding("site.broken_links", "high", `${broken.size} destino(s) roto(s): ${list([...broken])}.`, null));
    else out.push(finding("site.broken_links", "ok", "No se encontraron enlaces internos rotos entre los destinos verificados.", null));
    if (redirected.size) out.push(finding("site.redirected_links", "medium", `${redirected.size} enlace(s) interno(s) pasan por una redirección: ${list([...redirected])}.`, null));
  }
  return out;
}
