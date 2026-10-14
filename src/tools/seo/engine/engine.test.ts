import { describe, expect, it } from "vitest";
import {
  auditPage,
  auditPerformance,
  auditRobots,
  auditSitemaps,
  auditSite,
  consolidate,
  extractPageData,
  isAllowed,
  parsePsi,
  parseRobots,
  parseSitemap,
  summarize,
  type FetchRecord,
} from "./index";

const GOOD = `<!doctype html><html lang="es-MX"><head>
<title>Zapatos de piel para hombre | Tienda Demo</title>
<meta name="description" content="Compra zapatos de piel para hombre con envío gratis a todo México y meses sin intereses en Tienda Demo.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://www.demo.mx/zapatos">
<meta property="og:title" content="Zapatos"><meta property="og:description" content="d"><meta property="og:image" content="https://www.demo.mx/a.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Demo"},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1}]}]}</script>
</head><body><h1>Zapatos de piel para hombre</h1><h2>Destacados</h2><h3>Oxford</h3>
<p>${"palabra ".repeat(200)}</p>
<img src="/a.jpg" alt="Zapato oxford café"><a href="/botas">Botas</a><a href="https://demo.mx/tenis#x">Tenis</a><a href="https://otro.com" rel="nofollow">x</a><a href="mailto:a@b.c">m</a>
</body></html>`;

const BAD = `<html><head><title>Hola</title><meta name="robots" content="noindex, nofollow">
<script type="application/ld+json">{ roto </script></head>
<body><h1>A</h1><h1>B</h1><h4>salto</h4><img src="x.png"><img src="y.png" alt=""><script src="http://cdn.x/a.js"></script></body></html>`;

describe("extractPageData", () => {
  it("lee título, descripción, canonical, JSON-LD con @graph y enlaces internos", () => {
    const p = extractPageData("https://www.demo.mx/zapatos", GOOD);
    expect(p.title).toBe("Zapatos de piel para hombre | Tienda Demo");
    expect(p.canonical).toBe("https://www.demo.mx/zapatos");
    expect(p.jsonLd).toEqual({ blocks: 1, errors: 0, types: ["BreadcrumbList", "ListItem", "Organization"] });
    expect(p.links.internal.sort()).toEqual(["https://demo.mx/tenis", "https://www.demo.mx/botas"]);
    expect(p.links.external).toBe(1);
    expect(p.links.nofollow).toBe(1);
    expect(p.wordCount).toBeGreaterThan(200);
    expect(p.lang).toBe("es-MX");
  });
});

describe("auditPage", () => {
  it("una página bien hecha sale toda en CORRECTO (con palabra clave)", () => {
    const f = auditPage(extractPageData("https://www.demo.mx/zapatos", GOOD), { targetKeyword: "zapatos de piel" });
    expect(f.filter((x) => x.severity !== "ok")).toEqual([]);
    expect(f.map((x) => x.rule)).toContain("keyword.usage");
  });

  it("detecta noindex, títulos cortos, H1 múltiples, JSON-LD roto, alt y contenido mixto", () => {
    const f = auditPage(extractPageData("https://www.demo.mx/x", BAD));
    const sev = Object.fromEntries(f.map((x) => [x.rule, x.severity]));
    expect(sev["page.noindex"]).toBe("critical");
    expect(sev["page.nofollow"]).toBe("medium");
    expect(sev["title.present"]).toBe("medium");
    expect(sev["meta.description"]).toBe("high");
    expect(sev["h1"]).toBe("medium");
    expect(sev["headings.hierarchy"]).toBe("medium");
    expect(sev["structured_data"]).toBe("high");
    expect(sev["images.alt"]).toBe("medium");
    expect(sev["mixed_content"]).toBe("medium");
    expect(sev["viewport"]).toBe("high");
    expect(sev["canonical"]).toBe("medium");
    expect(sev["html.lang"]).toBe("medium");
  });

  it("canonical a otra URL o relativa es MEJORABLE; hreflang sin x-default también", () => {
    const html = `<html lang="es"><head><link rel="canonical" href="/otra"><link rel="alternate" hreflang="es-MX" href="https://d.mx/p"><link rel="alternate" hreflang="en" href="https://d.mx/en/p"></head><body></body></html>`;
    const f = auditPage(extractPageData("https://d.mx/p", html));
    expect(f.find((x) => x.rule === "canonical")?.detail).toContain("otra URL");
    expect(f.find((x) => x.rule === "hreflang")?.detail).toContain("x-default");
  });
});

describe("robots", () => {
  const txt = `User-agent: *\nDisallow: /checkout\nAllow: /checkout/ayuda\nDisallow: /*.pdf$\n\nUser-agent: BadBot\nDisallow: /\n\nSitemap: https://d.mx/sitemap.xml`;
  it("aplica la regla más específica y comodines", () => {
    const r = parseRobots(txt);
    expect(r.sitemaps).toEqual(["https://d.mx/sitemap.xml"]);
    expect(isAllowed(r, "/checkout/pago")).toBe(false);
    expect(isAllowed(r, "/checkout/ayuda")).toBe(true);
    expect(isAllowed(r, "/doc.pdf")).toBe(false);
    expect(isAllowed(r, "/doc.pdf?x=1")).toBe(true);
    expect(isAllowed(r, "/", "BadBot/2.0")).toBe(false);
  });
  it("Disallow: / para * es CRÍTICO; sin Sitemap es GRAVE; inaccesible es GRAVE", () => {
    const a = auditRobots("User-agent: *\nDisallow: /", 200).findings;
    expect(a.find((f) => f.rule === "robots.blocks_all")?.severity).toBe("critical");
    expect(a.find((f) => f.rule === "robots.sitemap_declared")?.severity).toBe("high");
    expect(auditRobots(null, 404).findings[0]).toMatchObject({ rule: "robots.reachable", severity: "high" });
    expect(auditRobots("User-agent: *\nDisallow:", 200).findings.find((f) => f.rule === "robots.blocks_all")?.severity).toBe("ok");
  });
});

describe("sitemaps", () => {
  const set = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://d.mx/a</loc><lastmod>2024-01-01</lastmod></url><url><loc>https://d.mx/b</loc></url></urlset>`;
  it("parsea urlset e índice", () => {
    expect(parseSitemap(set)).toMatchObject({ kind: "urlset", entries: [{ loc: "https://d.mx/a", lastmod: "2024-01-01" }, { loc: "https://d.mx/b", lastmod: null }] });
    expect(parseSitemap(`<sitemapindex><sitemap><loc>https://d.mx/s1.xml</loc></sitemap></sitemapindex>`).kind).toBe("index");
  });
  it("lastmod de más de un año es GRAVE; sin lastmod es MEJORABLE", () => {
    const r = auditSitemaps([{ url: "s", xml: set, status: 200 }], new Date("2026-10-13"));
    expect(r.urls).toEqual(["https://d.mx/a", "https://d.mx/b"]);
    expect(r.findings.find((f) => f.rule === "sitemap.freshness")?.severity).toBe("high");
    const noLast = auditSitemaps([{ url: "s", xml: `<urlset><url><loc>https://d.mx/a</loc></url></urlset>`, status: 200 }], new Date());
    expect(noLast.findings.find((f) => f.rule === "sitemap.freshness")?.severity).toBe("medium");
    expect(auditSitemaps([{ url: "s", xml: null, status: 500 }], new Date()).findings[0].severity).toBe("high");
  });
});

describe("auditSite", () => {
  it("detecta títulos duplicados y enlaces internos rotos o redirigidos", () => {
    const a = extractPageData("https://d.mx/a", `<title>Igual</title><a href="/roto">x</a><a href="/viejo">y</a>`);
    const b = extractPageData("https://d.mx/b", `<title>Igual</title>`);
    const rec = (url: string, status: number, redirects: string[] = []): FetchRecord => ({
      url, finalUrl: url, status, redirects, timeMs: 10, contentType: "text/html", xRobotsTag: null, error: null,
    });
    const f = auditSite([a, b], [rec("https://d.mx/roto", 404), rec("https://d.mx/viejo", 200, ["https://d.mx/nuevo"])]);
    expect(f.find((x) => x.rule === "site.duplicate_titles")?.severity).toBe("medium");
    expect(f.find((x) => x.rule === "site.broken_links")?.severity).toBe("high");
    expect(f.find((x) => x.rule === "site.redirected_links")?.severity).toBe("medium");
  });
});

describe("PageSpeed", () => {
  const psi = {
    id: "https://d.mx/",
    loadingExperience: {
      overall_category: "AVERAGE",
      metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 30 }, INTERACTION_TO_NEXT_PAINT: { percentile: 150 } },
    },
    lighthouseResult: {
      finalDisplayedUrl: "https://d.mx/",
      categories: { performance: { score: 0.42 }, seo: { score: 1 } },
      audits: {
        "largest-contentful-paint": { numericValue: 5200 },
        "cumulative-layout-shift": { numericValue: 0.05 },
        "render-blocking-resources": { title: "Elimina recursos que bloquean", details: { type: "opportunity", overallSavingsMs: 900 } },
      },
    },
  };
  it("prefiere datos de campo y aplica los umbrales de Core Web Vitals", () => {
    const p = parsePsi(psi, "mobile");
    expect(p.performanceScore).toBe(42);
    expect(p.lighthouseSeoScore).toBe(100);
    expect(p.field).toEqual({ lcpMs: 3100, cls: 0.3, inpMs: 150, category: "AVERAGE" });
    expect(p.opportunities[0]).toMatchObject({ id: "render-blocking-resources", savingsMs: 900 });
    const sev = Object.fromEntries(auditPerformance(p).map((f) => [f.rule, f.severity]));
    expect(sev).toEqual({ "perf.score": "high", "perf.lcp": "medium", "perf.cls": "high", "perf.inp": "ok" });
  });
});

describe("resumen y puntuación", () => {
  it("consolida la misma regla por URL quedándose con la más grave y los conteos cuadran", () => {
    const base = { category: "indexacion" as const, element: "x", detail: "d" };
    const f = consolidate([
      { ...base, rule: "page.noindex", severity: "ok", url: "https://d.mx/" },
      { ...base, rule: "page.noindex", severity: "critical", url: "https://d.mx/" },
      { ...base, rule: "sitemap.reachable", severity: "ok", url: null },
      { ...base, rule: "sitemap.reachable", severity: "high", url: null },
    ]);
    expect(f).toHaveLength(3);
    expect(f[0].severity).toBe("critical");
    const s = summarize(f, 1);
    expect(s.counts).toEqual({ critical: 1, high: 1, medium: 0, ok: 1 });
    expect(s.counts.critical + s.counts.high + s.counts.medium + s.counts.ok).toBe(f.length);
    // noindex (peso 3, crédito 0) + sitemap (peso 2, peor = high, 0.25) → 0.5/5 = 10
    expect(s.score).toBe(10);
  });
  it("todo correcto = 100", () => {
    const f = auditPage(extractPageData("https://www.demo.mx/zapatos", GOOD));
    expect(summarize(f, 1).score).toBe(100);
  });
});
