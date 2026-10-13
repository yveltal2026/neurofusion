import { describe, expect, it } from "vitest";
import { runLiveAudit, runUploadAudit, type CrawlDeps } from "./crawl";
import { assertPublicUrl, isPrivateIp } from "./net-guard";
import { seoConfigSchema } from "./config";

const page = (title: string, links: string[] = []) =>
  `<html lang="es"><head><title>${title}</title><meta name="viewport" content="width=device-width"></head><body><h1>${title}</h1>${links
    .map((l) => `<a href="${l}">l</a>`)
    .join("")}</body></html>`;

function fakeSite(routes: Record<string, { status: number; body?: string; headers?: Record<string, string> }>): CrawlDeps & { hits: string[] } {
  const hits: string[] = [];
  let t = 0;
  return {
    hits,
    lookup: async () => ["93.184.216.34"],
    now: () => (t += 5),
    fetch: (async (input: RequestInfo | URL) => {
      const url = String(input);
      hits.push(url);
      const r = routes[url];
      if (!r) return new Response("no", { status: 404 });
      return new Response(r.body ?? "", { status: r.status, headers: { "content-type": "text/html; charset=utf-8", ...r.headers } });
    }) as typeof fetch,
  };
}

describe("net-guard", () => {
  it("bloquea IPs privadas, localhost y puertos raros", async () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    const pub = async () => ["93.184.216.34"];
    await expect(assertPublicUrl("http://localhost/", pub)).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest", pub)).rejects.toThrow();
    await expect(assertPublicUrl("https://d.mx:8080/", pub)).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd", pub)).rejects.toThrow();
    await expect(assertPublicUrl("https://interno.d.mx/", async () => ["10.1.1.1"])).rejects.toThrow("privada");
    await expect(assertPublicUrl("https://d.mx/", pub)).resolves.toBeUndefined();
    await expect(
      assertPublicUrl("https://no-existe.mx/", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toThrow("no resuelve");
  });
});

describe("runLiveAudit", () => {
  const config = seoConfigSchema.parse({ siteUrl: "https://d.mx/", maxPages: 5, checkPerformance: false });

  it("rastrea respetando robots.txt, sigue enlaces internos y detecta enlaces rotos", async () => {
    const deps = fakeSite({
      "https://d.mx/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /privado\nSitemap: https://d.mx/sitemap.xml" },
      "http://d.mx/": { status: 301, headers: { location: "https://d.mx/" } },
      "https://d.mx/sitemap.xml": { status: 200, body: `<urlset><url><loc>https://d.mx/</loc><lastmod>2026-10-01</lastmod></url></urlset>` },
      "https://d.mx/": { status: 200, body: page("Inicio de la tienda demo en línea", ["/a", "/privado/x", "/roto", "https://otro.com/"]) },
      "https://d.mx/a": { status: 200, body: page("Inicio de la tienda demo en línea") },
    });
    const out = await runLiveAudit(config, deps);
    expect(deps.hits).not.toContain("https://d.mx/privado/x");
    expect(out.pages.map((p) => [p.url, p.status]).sort()).toEqual([["https://d.mx/", 200], ["https://d.mx/a", 200], ["https://d.mx/roto", 404]]);
    const sev = (rule: string) => out.findings.filter((f) => f.rule === rule).map((f) => f.severity);
    expect(sev("https.redirect")).toEqual(["ok"]);
    expect(sev("site.broken_links")).toEqual(["high"]);
    expect(sev("site.duplicate_titles")).toEqual(["medium"]);
    const c = out.summary.counts;
    expect(c.critical + c.high + c.medium + c.ok).toBe(out.findings.length);
    expect(out.engineVersion).toBe("nf-seo-1.0");
  });

  it("no sigue redirecciones hacia la red interna", async () => {
    const deps = fakeSite({ "https://d.mx/": { status: 302, headers: { location: "http://127.0.0.1/admin" } } });
    const out = await runLiveAudit(config, deps);
    expect(deps.hits).not.toContain("http://127.0.0.1/admin");
    expect(out.findings.find((f) => f.rule === "page.reachable")?.detail).toContain("privada");
  });

  it("rechaza de entrada un sitio privado", async () => {
    const deps = fakeSite({});
    deps.lookup = async () => ["10.0.0.5"];
    await expect(runLiveAudit(config, deps)).rejects.toThrow();
  });
});

describe("runUploadAudit", () => {
  it("audita HTML subido sin red y lo anota", () => {
    const out = runUploadAudit({ siteUrl: "https://d.mx", targetKeyword: null }, [{ url: "https://d.mx/", html: page("Hola") }], () => 0);
    expect(out.mode).toBe("upload");
    expect(out.pages).toHaveLength(1);
    expect(out.notes[0]).toContain("Modo asistido");
    expect(out.findings.some((f) => f.rule === "title.present")).toBe(true);
  });
});
