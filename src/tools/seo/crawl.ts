/**
 * Rastreador de la auditoría SEO. Hace TODA la red (robots, sitemaps, páginas,
 * PageSpeed) y entrega al motor puro datos ya descargados. Las dependencias de red
 * se inyectan para poder probarlo sin internet.
 */
import { gunzipSync } from "node:zlib";
import {
  auditFetch,
  auditPage,
  auditPerformance,
  auditRobots,
  auditSitemaps,
  auditSite,
  consolidate,
  ENGINE_VERSION,
  extractPageData,
  isAllowed,
  isSameSite,
  normalizeUrl,
  originOf,
  parsePsi,
  parseSitemap,
  sortFindings,
  summarize,
  finding,
  type AuditSummary,
  type FetchedSitemap,
  type FetchRecord,
  type Finding,
  type PageData,
  type PageSummary,
  type ParsedRobots,
  type PerformanceResult,
} from "./engine";
import { assertPublicUrl, BlockedUrlError, type Lookup } from "./net-guard";
import type { SeoConfig } from "./config";

export const USER_AGENT = "NeuroFusion-SEO-Audit/1.0 (+auditoría solicitada por el propietario del sitio)";
const MAX_BODY = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export interface CrawlDeps {
  fetch: typeof fetch;
  lookup: Lookup;
  now: () => number;
  /** Clave opcional de la API de PageSpeed Insights (sin clave hay cuota baja). */
  psiKey?: string;
}

export interface AuditOutcome {
  mode: "live" | "upload";
  siteUrl: string;
  engineVersion: string;
  summary: AuditSummary;
  pages: PageSummary[];
  findings: Finding[];
  performance: PerformanceResult | null;
  notes: string[];
  durationMs: number;
}

interface Downloaded {
  rec: FetchRecord;
  body: string | null;
}

async function readLimited(res: Response, max: number): Promise<{ buf: Uint8Array; truncated: boolean }> {
  if (!res.body) return { buf: new Uint8Array(await res.arrayBuffer()).slice(0, max), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > max) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const buf = new Uint8Array(Math.min(size, max));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.length) break;
  }
  return { buf, truncated };
}

function decode(buf: Uint8Array, contentType: string | null): string {
  const charset = /charset=([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** GET siguiendo redirecciones a mano (cada salto pasa por la protección SSRF). */
export async function download(url: string, deps: CrawlDeps, timeoutMs: number, wantBody = true): Promise<Downloaded> {
  const redirects: string[] = [];
  const started = deps.now();
  let current = url;
  const base: FetchRecord = { url, finalUrl: url, status: null, redirects, timeMs: null, contentType: null, xRobotsTag: null, error: null };
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(current, deps.lookup);
      const res = await deps.fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) return { rec: { ...base, finalUrl: current, status: res.status, error: "demasiadas redirecciones" }, body: null };
        const next = normalizeUrl(location, current);
        if (!next) return { rec: { ...base, status: res.status, error: "redirección inválida" }, body: null };
        redirects.push(next);
        await res.body?.cancel();
        current = next;
        continue;
      }
      const contentType = res.headers.get("content-type");
      const rec: FetchRecord = {
        ...base,
        finalUrl: current,
        status: res.status,
        timeMs: deps.now() - started,
        contentType,
        xRobotsTag: res.headers.get("x-robots-tag"),
      };
      if (!wantBody || res.status >= 400) {
        await res.body?.cancel();
        return { rec, body: null };
      }
      const { buf } = await readLimited(res, MAX_BODY);
      const isGzip = /gzip/i.test(contentType ?? "") || current.endsWith(".gz");
      if (isGzip && buf[0] === 0x1f && buf[1] === 0x8b) return { rec, body: gunzipSync(buf).toString("utf-8") };
      return { rec, body: decode(buf, contentType) };
    }
  } catch (e) {
    const msg = e instanceof BlockedUrlError ? e.message : e instanceof Error && e.name === "TimeoutError" ? "tiempo de espera agotado" : "error de red";
    return { rec: { ...base, finalUrl: current, error: msg }, body: null };
  }
}

async function runPool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function fetchPerformance(url: string, strategy: "mobile" | "desktop", deps: CrawlDeps): Promise<PerformanceResult | string> {
  const q = new URLSearchParams({ url, strategy, category: "performance", locale: "es" });
  if (deps.psiKey) q.set("key", deps.psiKey);
  try {
    const res = await deps.fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(75_000) });
    if (!res.ok) return `PageSpeed Insights respondió ${res.status}${res.status === 429 ? " (cuota agotada; configura PAGESPEED_API_KEY)" : ""}.`;
    return parsePsi(await res.json(), strategy);
  } catch {
    return "No se pudo consultar PageSpeed Insights (tiempo agotado o error de red).";
  }
}

function pageSummary(rec: FetchRecord, page: PageData | null, source: "live" | "upload"): PageSummary {
  return {
    url: rec.url,
    finalUrl: rec.finalUrl,
    status: rec.status,
    timeMs: rec.timeMs,
    title: page?.title ?? null,
    metaDescription: page?.metaDescription ?? null,
    h1: page?.h1[0] ?? null,
    wordCount: page?.wordCount ?? null,
    internalLinks: page?.links.internal.length ?? null,
    source,
  };
}

function finish(
  mode: "live" | "upload",
  siteUrl: string,
  raw: Finding[],
  pages: PageSummary[],
  performance: PerformanceResult | null,
  notes: string[],
  started: number,
  now: number,
): AuditOutcome {
  const findings = sortFindings(consolidate(raw));
  return {
    mode,
    siteUrl,
    engineVersion: ENGINE_VERSION,
    summary: summarize(findings, pages.length),
    pages,
    findings,
    performance,
    notes,
    durationMs: now - started,
  };
}

/** Auditoría en vivo: robots → sitemaps → rastreo acotado → enlaces → rendimiento. */
export async function runLiveAudit(config: SeoConfig, deps: CrawlDeps, budgetMs = 85_000): Promise<AuditOutcome> {
  const started = deps.now();
  const deadline = started + budgetMs;
  const left = () => deadline - deps.now();
  const notes: string[] = [];
  const raw: Finding[] = [];
  const siteUrl = normalizeUrl(config.siteUrl) ?? config.siteUrl;
  const origin = originOf(siteUrl);

  await assertPublicUrl(siteUrl, deps.lookup);

  const perfPromise = config.checkPerformance ? fetchPerformance(siteUrl, config.strategy, deps) : Promise.resolve(null);

  // robots.txt
  const robotsDl = await download(`${origin}/robots.txt`, deps, 15_000);
  const robotsOk = robotsDl.body !== null && robotsDl.rec.status === 200;
  const ra = auditRobots(robotsOk ? robotsDl.body : null, robotsDl.rec.status);
  raw.push(...ra.findings);
  const robots: ParsedRobots | null = ra.robots;

  // http → https
  if (siteUrl.startsWith("https://")) {
    const httpDl = await download(siteUrl.replace(/^https:/, "http:"), deps, 15_000, false);
    if (httpDl.rec.error) notes.push(`No se pudo verificar la redirección http→https (${httpDl.rec.error}).`);
    else if (httpDl.rec.finalUrl.startsWith("https://")) raw.push(finding("https.redirect", "ok", "La versión http:// redirige a https://.", null));
    else raw.push(finding("https.redirect", "high", `La versión http:// responde ${httpDl.rec.status} sin redirigir a https://.`, null));
  }

  // sitemaps (máx. 3; si es índice, se siguen hasta 3 hijos)
  const declared = robots?.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
  const sitemaps: FetchedSitemap[] = [];
  for (const sm of declared.slice(0, 3)) {
    const dl = await download(sm, deps, 20_000);
    const ok = dl.body !== null && dl.rec.status === 200;
    sitemaps.push({ url: sm, xml: ok ? dl.body : null, status: dl.rec.status });
    if (ok && dl.body) {
      const parsed = parseSitemap(dl.body);
      if (parsed.kind === "index") {
        for (const child of parsed.entries.slice(0, 3)) {
          const c = await download(child.loc, deps, 20_000);
          const cok = c.body !== null && c.rec.status === 200;
          sitemaps.push({ url: child.loc, xml: cok ? c.body : null, status: c.rec.status });
        }
      }
    }
  }
  if (!robots?.sitemaps.length) notes.push("robots.txt no declara sitemaps; se probó /sitemap.xml.");
  const sm = auditSitemaps(sitemaps, new Date(deps.now()));
  raw.push(...sm.findings);

  // Rastreo acotado por número de páginas y por tiempo.
  const seeds = [siteUrl, ...config.extraUrls.map((u) => normalizeUrl(u)).filter((u): u is string => !!u)];
  const queue: string[] = [];
  const seen = new Set<string>();
  const enqueue = (u: string) => {
    if (seen.has(u) || !isSameSite(u, siteUrl)) return;
    const { pathname, search } = new URL(u);
    if (robots && !isAllowed(robots, pathname + search, USER_AGENT)) return;
    seen.add(u);
    queue.push(u);
  };
  seeds.forEach(enqueue);
  // Si el rastreo no alcanza, completa con URLs del sitemap.
  const fromSitemap = sm.urls.map((u) => normalizeUrl(u)).filter((u): u is string => !!u);

  const pages: PageData[] = [];
  const fetches: FetchRecord[] = [];
  const summaries: PageSummary[] = [];
  let skippedForTime = false;
  // Tope de descargas: evita que un sitio con muchos enlaces rotos consuma todo el tiempo.
  while (queue.length && pages.length < config.maxPages && fetches.length < config.maxPages * 2) {
    if (left() < 20_000) {
      skippedForTime = true;
      break;
    }
    const batch = queue.splice(0, Math.min(4, config.maxPages - pages.length));
    await runPool(batch, 4, async (u) => {
      const dl = await download(u, deps, 15_000);
      fetches.push(dl.rec);
      raw.push(...auditFetch(dl.rec));
      const isHtml = /html/i.test(dl.rec.contentType ?? "");
      if (dl.body !== null && isHtml) {
        const page = extractPageData(dl.rec.finalUrl, dl.body);
        // El hallazgo se reporta con la URL pedida para que cuadre con auditFetch.
        page.url = dl.rec.url;
        pages.push(page);
        raw.push(...auditPage(page, { targetKeyword: config.targetKeyword }));
        summaries.push(pageSummary(dl.rec, page, "live"));
        for (const l of page.links.internal) enqueue(l);
      } else {
        summaries.push(pageSummary(dl.rec, null, "live"));
      }
    });
    if (!queue.length) for (const u of fromSitemap.splice(0, 10)) enqueue(u);
  }
  if (skippedForTime) notes.push("El rastreo se detuvo antes del límite de páginas para no exceder el tiempo máximo.");

  // Verifica destinos internos enlazados que no se rastrearon (máx. 30, sin cuerpo).
  const crawled = new Set(fetches.map((f) => f.url));
  const allowed = (u: string) => {
    const { pathname, search } = new URL(u);
    return !robots || isAllowed(robots, pathname + search, USER_AGENT);
  };
  const targets = [...new Set(pages.flatMap((p) => p.links.internal))].filter((u) => !crawled.has(u) && allowed(u)).slice(0, 30);
  if (targets.length && left() > 15_000) {
    await runPool(targets, 6, async (u) => {
      if (left() < 10_000) return;
      fetches.push((await download(u, deps, 10_000, false)).rec);
    });
  }
  raw.push(...auditSite(pages, fetches));

  let performance: PerformanceResult | null = null;
  const perf = await perfPromise;
  if (typeof perf === "string") notes.push(perf);
  else if (perf) {
    performance = perf;
    raw.push(...auditPerformance(perf));
  }
  if (pages.length === 0) notes.push("No se pudo descargar ningún HTML. Si el sitio bloquea rastreadores, usa el modo asistido (subir HTML).");
  notes.push("Se analiza el HTML tal como lo entrega el servidor, sin ejecutar JavaScript.");

  return finish("live", siteUrl, raw, summaries, performance, notes, started, deps.now());
}

export interface UploadedPage {
  url: string;
  html: string;
}

/** Modo asistido: el analista sube el HTML guardado desde su navegador. Sin red. */
export function runUploadAudit(config: Pick<SeoConfig, "siteUrl" | "targetKeyword">, files: UploadedPage[], now: () => number): AuditOutcome {
  const started = now();
  const raw: Finding[] = [];
  const pages: PageData[] = [];
  const summaries: PageSummary[] = [];
  for (const f of files) {
    const url = normalizeUrl(f.url) ?? f.url;
    const page = extractPageData(url, f.html);
    pages.push(page);
    raw.push(...auditPage(page, { targetKeyword: config.targetKeyword }));
    summaries.push(
      pageSummary({ url, finalUrl: url, status: null, redirects: [], timeMs: null, contentType: "text/html", xRobotsTag: null, error: null }, page, "upload"),
    );
  }
  raw.push(...auditSite(pages, []));
  const notes = [
    "Modo asistido: se auditó el HTML subido por el analista. No se revisaron robots.txt, sitemaps, códigos HTTP, enlaces rotos ni rendimiento.",
  ];
  return finish("upload", normalizeUrl(config.siteUrl) ?? config.siteUrl, raw, summaries, null, notes, started, now());
}
