import { describe, expect, it } from "vitest";
import { pageTargetsFromForm, seoConfigSchema, targetForUrl } from "./config";
import {
  auditFetch,
  auditPage,
  auditTechnical,
  auditSite,
  extractPageData,
  finding,
  parseRobots,
  summarize,
  consolidate,
} from "./engine";
import { runUploadAudit } from "./crawl";
import { compareAudits } from "./comparison";
import { diagnosticFindings } from "./diagnostics";
import { buildSeoUserPrompt, groupFailing } from "./analysis/prompt";
import type { FetchRecord, Finding } from "./engine";
import type { SeoAudit } from "./results";

const root = "https://demo.mx/";
const a = root + "a";
const b = root + "b";
const page = (url = a, html = "") =>
  extractPageData(
    url,
    `<html><head>${html}</head><body><h1>Principal</h1></body></html>`,
  );
const response = (url = a, patch: Partial<FetchRecord> = {}): FetchRecord => ({
  url,
  finalUrl: url,
  status: 200,
  redirects: [],
  timeMs: 20,
  contentType: "text/html",
  xRobotsTag: null,
  error: null,
  ...patch,
});
const get = (findings: Finding[], rule: string) =>
  findings.find((f) => f.rule === rule);
function audit(findings: Finding[]): SeoAudit {
  const out = runUploadAudit(
    { siteUrl: root, targetKeyword: null },
    [{ url: a, html: "<title>Ejemplo</title>" }],
    () => 0,
  );
  return {
    ...out,
    summary: { ...out.summary, ...summarize(findings, 1) },
    findings,
    id: "audit",
    ai: null,
    createdAt: "2026-10-28T00:00:00Z",
  };
}

describe("objetivos por URL", () => {
  it("lee estudios anteriores y valida sitio, duplicados y límites", () => {
    expect(seoConfigSchema.parse({ siteUrl: root }).pageTargets).toEqual([]);
    expect(
      seoConfigSchema.safeParse({
        siteUrl: root,
        pageTargets: [{ url: "https://otro.mx/a" }],
      }).success,
    ).toBe(false);
    expect(
      seoConfigSchema.safeParse({
        siteUrl: root,
        pageTargets: [{ url: a }, { url: a + "#seccion" }],
      }).success,
    ).toBe(false);
    expect(
      seoConfigSchema.safeParse({
        siteUrl: root,
        pageTargets: Array.from({ length: 26 }, (_, i) => ({ url: root + i })),
      }).success,
    ).toBe(false);
  });
  it("prioriza el objetivo propio y permite no asignar palabra clave a esa URL", () => {
    const config = seoConfigSchema.parse({
      siteUrl: root,
      targetKeyword: "general",
      pageTargets: [
        { url: a, keyword: "específica", goal: "Cotizar", indexable: false },
        { url: b },
      ],
    });
    expect(targetForUrl(config, a + "#detalle")).toEqual({
      keyword: "específica",
      goal: "Cotizar",
      indexable: false,
    });
    expect(targetForUrl(config, b).keyword).toBeNull();
    expect(targetForUrl(config, root + "c").keyword).toBe("general");
    expect(targetForUrl(config, a + "/").keyword).toBe("general");
  });
  it("conserva la alineación de campos enviados al quitar filas del formulario", () => {
    const fd = new FormData();
    for (const [url, keyword, goal, indexing] of [
      [a, "zapatos", "Comprar", "index"],
      [b, "", "Privada", "exclude"],
    ]) {
      fd.append("targetUrl", url);
      fd.append("pageKeyword", keyword);
      fd.append("pageGoal", goal);
      fd.append("pageIndexing", indexing);
    }
    expect(pageTargetsFromForm(fd)).toEqual([
      { url: a, keyword: "zapatos", goal: "Comprar", indexable: true },
      { url: b, keyword: null, goal: "Privada", indexable: false },
    ]);
  });
  it("guarda el contexto efectivo en el resultado sin depender de cambios de configuración posteriores", () => {
    const config = seoConfigSchema.parse({
      siteUrl: root,
      pageTargets: [
        { url: a, keyword: "prueba", goal: "Informar", indexable: false },
      ],
    });
    const out = runUploadAudit(
      config,
      [
        {
          url: a,
          html: '<meta name="robots" content="noindex"><title>Prueba</title>',
        },
      ],
      () => 0,
    );
    expect(out.pages[0].target).toEqual({
      keyword: "prueba",
      goal: "Informar",
      indexable: false,
    });
    expect(out.summary.scope?.pageTargets[0].goal).toBe("Informar");
    expect(get(out.findings, "page.noindex")?.severity).toBe("ok");
    expect(out.summary.coverage).toMatchObject({
      htmlPages: 1,
      httpChecks: 0,
      stopReason: "upload",
    });
  });
});

describe("puntuación y evidencia contextual", () => {
  it("las longitudes, varios H1 y el conteo de palabras no restan puntos", () => {
    const data = extractPageData(
      a,
      '<title>Corto</title><meta name="description" content="Breve"><h1>Uno</h1><h1>Dos</h1>',
    );
    const findings = auditPage(data);
    for (const rule of [
      "title.present",
      "meta.description",
      "h1",
      "content.thin",
      "structured_data",
    ])
      expect(get(findings, rule)?.advisory).toBe(true);
    const measured = finding("page.reachable", "ok", "HTTP 200", a);
    expect(
      summarize([measured, ...findings.filter((f) => f.advisory)], 1).score,
    ).toBe(100);
    expect(summarize([], 0).scoredChecks).toBe(0);
  });
  it("considera noindex intencional, incluyendo la cabecera, sin afirmar indexación real", () => {
    const data = page(a);
    expect(
      get(
        auditPage(data, { indexable: false, xRobotsTag: "noindex" }),
        "page.noindex",
      )?.severity,
    ).toBe("ok");
    expect(
      get(
        auditFetch(response(a, { xRobotsTag: "noindex" }), {
          indexable: false,
        }),
        "page.noindex",
      )?.severity,
    ).toBe("ok");
    expect(
      get(
        auditPage(data, { indexable: false, xRobotsTag: null }),
        "page.noindex",
      )?.severity,
    ).toBe("high");
    expect(
      get(auditPage(data, { indexable: false }), "page.noindex")?.advisory,
    ).toBe(true);
    expect(get(auditPage(data), "page.noindex")?.detail).toContain(
      "no confirma indexación",
    );
  });
  it("mantiene observaciones y resultados medidos de la misma regla separados", () => {
    const measured = finding("site.broken_links", "high", "Un 404", a);
    const contextual = finding(
      "site.broken_links",
      "medium",
      "Otro destino sin verificar",
      a,
      true,
    );
    expect(consolidate([measured, contextual])).toHaveLength(2);
    expect(
      groupFailing([measured, contextual]).map((g) => g.contextual),
    ).toEqual([false, true]);
    expect(diagnosticFindings([contextual, measured]).weaknesses).toEqual([
      measured,
    ]);
  });
});

describe("cruces técnicos con evidencia descargada", () => {
  it("detecta canónicas contradictorias y normaliza declaraciones equivalentes", () => {
    expect(
      get(
        auditTechnical(
          [
            page(
              a,
              `<link rel="canonical" href="${a}"><link rel="canonical" href="${b}">`,
            ),
          ],
          [],
        ),
        "canonical.conflict",
      )?.severity,
    ).toBe("high");
    expect(
      get(
        auditTechnical(
          [
            page(
              a,
              `<link rel="canonical" href="/a"><link rel="canonical" href="${a}#x">`,
            ),
          ],
          [],
        ),
        "canonical.conflict",
      )?.severity,
    ).toBe("ok");
  });
  it.each([
    ["HTTP 404", response(b, { status: 404 }), page(b), "high"],
    [
      "noindex de cabecera",
      response(b, { xRobotsTag: "noindex" }),
      page(b),
      "high",
    ],
    [
      "cadena canónica",
      response(b),
      page(b, `<link rel="canonical" href="${root}c">`),
      "high",
    ],
    ["destino correcto", response(b), page(b), "ok"],
  ])("comprueba %s", (_, rec, target, severity) => {
    const source = page(a, `<link rel="canonical" href="${b}">`);
    expect(
      get(auditTechnical([source, target], [rec]), "canonical.target")
        ?.severity,
    ).toBe(severity);
  });
  it("no exige indexabilidad al destino canónico de una página excluida intencionalmente", () => {
    const source = page(
      a,
      `<meta name="robots" content="noindex"><link rel="canonical" href="${a}">`,
    );
    source.expectedIndexable = false;
    expect(
      get(auditTechnical([source], [response(a)]), "canonical.target"),
    ).toBeUndefined();
    expect(
      get(auditTechnical([source], [response(a)], [a]), "sitemap.indexability")
        ?.severity,
    ).toBe("high");
  });

  it("no inventa un error si el destino no se descargó o falló la red", () => {
    const source = page(a, `<link rel="canonical" href="${b}">`);
    for (const recs of [[], [response(b, { status: null, error: "timeout" })]])
      expect(
        get(auditTechnical([source], recs), "canonical.target")?.advisory,
      ).toBe(true);
  });
  it("resuelve la canonical respecto al documento final tras una redirección", () => {
    const source = page(
      root + "directorio/",
      '<link rel="canonical" href="./">',
    );
    source.url = a;
    expect(get(auditPage(source), "canonical")?.severity).toBe("medium"); // relativa, no otra URL
    expect(get(auditPage(source), "canonical")?.advisory).not.toBe(true);
    expect(
      get(
        auditTechnical(
          [source],
          [
            response(a, {
              finalUrl: root + "directorio/",
              redirects: [root + "directorio/"],
            }),
          ],
        ),
        "canonical.target",
      )?.severity,
    ).toBe("medium");
  });
  it("contrasta HTTP, noindex y bloqueos del sitemap sin inferir fallos en URLs sin revisar", () => {
    const robots = parseRobots("User-agent: Googlebot\nDisallow: /privado");
    const findings = auditTechnical(
      [page(a), page(b, '<meta name="robots" content="noindex">')],
      [response(a), response(b)],
      [a, b, root + "privado", root + "desconocida"],
      robots,
      root.slice(0, -1),
    );
    expect(
      findings
        .filter((f) => f.rule === "sitemap.indexability")
        .map((f) => [f.url, f.severity]),
    ).toEqual([
      [a, "ok"],
      [b, "high"],
      [root + "privado", "high"],
    ]);
  });
  it("comprueba reciprocidad hreflang sólo en destinos descargados; x-default es opcional", () => {
    const source = page(
      a,
      `<link rel="alternate" hreflang="es" href="${a}"><link rel="alternate" hreflang="en" href="${b}">`,
    );
    expect(get(auditPage(source), "hreflang")?.severity).toBe("ok");
    expect(
      get(auditTechnical([source], []), "hreflang.return"),
    ).toBeUndefined();
    expect(
      get(auditTechnical([source, page(b)], []), "hreflang.return")?.severity,
    ).toBe("medium");
    expect(
      get(
        auditTechnical(
          [source, page(b, `<link rel="alternate" hreflang="es" href="${a}">`)],
          [],
        ),
        "hreflang.return",
      )?.severity,
    ).toBe("ok");
  });
  it("valida campos JSON-LD soportados y contextos heredados en @graph", () => {
    const good = page(
      a,
      '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Zapato"},{"@type":"Article","headline":"Guía"}]}</script>',
    );
    expect(good.jsonLd.issues).toEqual([]);
    const bad = page(
      a,
      '<script type="application/ld+json">{"@type":"Product"}</script>',
    );
    expect(bad.jsonLd.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("@context"),
        expect.stringContaining("name"),
      ]),
    );
    expect(get(auditPage(bad), "structured_data.fields")?.severity).toBe(
      "medium",
    );
  });
  it("explica en la página origen los enlaces con HTTP confirmado y los errores de red como incertidumbre", () => {
    const source = extractPageData(a, '<a href="/b">B</a><a href="/c">C</a>');
    const findings = auditSite(
      [source],
      [
        response(b, { status: 404 }),
        response(root + "c", { status: null, error: "timeout" }),
      ],
    );
    expect(get(findings, "site.broken_links")).toMatchObject({
      url: a,
      severity: "high",
    });
    expect(
      findings.some((f) => f.advisory && f.detail.includes("No se confirma")),
    ).toBe(true);
  });
});

describe("comparación conservadora de auditorías", () => {
  const previous = audit([
    finding("h1", "high", "Sin H1", a),
    finding("meta.description", "ok", "Presente", a),
    finding("canonical", "high", "Vacía", a),
  ]);
  it("separa resueltos, nuevos, persistentes, primera observación y no verificados", () => {
    const current = audit([
      finding("h1", "ok", "H1 presente", a),
      finding("meta.description", "medium", "Falta", a),
      finding("images.alt", "medium", "Sin alt", a),
    ]);
    const comparison = compareAudits(current, previous);
    expect(comparison.resolved.map((f) => f.rule)).toEqual(["h1"]);
    expect(comparison.newIssues.map((f) => f.rule)).toEqual([
      "meta.description",
    ]);
    expect(comparison.firstObserved.map((f) => f.rule)).toEqual(["images.alt"]);
    expect(comparison.unverified.map((f) => f.rule)).toEqual(["canonical"]);
    expect(comparison.scoreDelta).toBeNull();
  });
  it("no declara resuelto un fallo sustituido por una observación contextual", () => {
    const current = audit([finding("h1", "medium", "Sin verificar", a, true)]);
    expect(compareAudits(current, previous).unverified).toHaveLength(2);
    expect(compareAudits(current, previous).resolved).toHaveLength(0);
  });
  it("calcula delta sólo para las mismas comprobaciones y URLs", () => {
    const current = audit(
      previous.findings.map((f) => ({ ...f, severity: "ok" })),
    );
    const comparison = compareAudits(current, previous);
    expect(comparison.sameCoverage).toBe(true);
    expect(comparison.scoreDelta).toBeGreaterThan(0);
    expect(comparison.resolved).toHaveLength(2);
  });
  it.each(["mode", "engineVersion", "scope"])(
    "evita comparar cambios de %s",
    (change) => {
      const current = audit(previous.findings);
      if (change === "mode") current.mode = "live";
      if (change === "engineVersion") current.engineVersion = "anterior";
      if (change === "scope") current.summary.scope!.targetKeyword = "otra";
      expect(compareAudits(current, previous).compatible).toBe(false);
    },
  );
  it("no declara resueltos duplicados si desaparece de la muestra la otra página", () => {
    const old = audit([
      finding("site.duplicate_titles", "medium", "Repetido", a),
    ]);
    old.pages.push({ ...old.pages[0], url: b });
    const current = audit([
      finding("site.duplicate_titles", "ok", "No repetido", a),
    ]);
    const comparison = compareAudits(current, old);
    expect(comparison.resolved).toHaveLength(0);
    expect(comparison.unverified).toHaveLength(1);
  });
  it("no mezcla auditorías anteriores sin configuración histórica", () => {
    const old = audit(previous.findings);
    delete old.summary.scope;
    expect(compareAudits(previous, old).compatible).toBe(false);
  });
  it("el prompt conserva objetivos y no añade contenido o métricas no descargados", () => {
    const current = audit(previous.findings);
    current.pages[0].target = {
      keyword: "zapatos",
      goal: "Cotizar",
      indexable: true,
    };
    const prompt = buildSeoUserPrompt({ ...current, targetKeyword: null });
    expect(prompt).toContain('"objetivoGuardado"');
    expect(prompt).toContain("Cotizar");
    expect(prompt).toContain('"cobertura"');
  });
});
