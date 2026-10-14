import { describe, expect, it } from "vitest";
import { auditPage, extractPageData, summarize } from "../engine";
import { buildSeoUserPrompt, groupFailing } from "./prompt";
import { seoAiResultSchema } from "./schema";

describe("prompt del plan SEO", () => {
  const pages = ["https://d.mx/a", "https://d.mx/b"].map((u) => extractPageData(u, "<html><head><title>x</title></head><body><p>secreto-del-html</p></body></html>"));
  const findings = pages.flatMap((p) => auditPage(p));

  it("agrupa los hallazgos por regla en vez de repetirlos por URL", () => {
    const g = groupFailing(findings);
    const desc = g.find((x) => x.regla === "meta.description");
    expect(desc?.paginasAfectadas).toBe(2);
    expect(g.every((x) => x.severidad !== "ok")).toBe(true);
  });

  it("no envía el HTML crudo, sólo hallazgos y metadatos de las páginas", () => {
    const text = buildSeoUserPrompt({
      siteUrl: "https://d.mx",
      mode: "upload",
      targetKeyword: "licuadoras",
      summary: summarize(findings, 2),
      findings,
      pages: pages.map((p) => ({ url: p.url, finalUrl: p.url, status: null, timeMs: null, title: p.title, metaDescription: null, h1: null, wordCount: p.wordCount, internalLinks: 0, source: "upload" })),
      performance: null,
      notes: [],
    });
    expect(text).not.toContain("secreto-del-html");
    expect(text).toContain("licuadoras");
  });

  it("el esquema exige reescrituras con campo válido", () => {
    const ok = seoAiResultSchema.safeParse({
      executiveSummary: "s",
      priorities: [{ title: "t", rationale: "r", actions: ["a"], impact: "high", effort: "low" }],
      quickWins: [],
      rewrites: [{ url: "https://d.mx/a", field: "title", current: "x", proposal: "Licuadoras de 10 velocidades | D", reason: "r" }],
      limitations: [],
    });
    expect(ok.success).toBe(true);
    expect(seoAiResultSchema.safeParse({ executiveSummary: "s", priorities: [], quickWins: [], rewrites: [{ url: "u", field: "body", proposal: "p", reason: "r", current: null }], limitations: [] }).success).toBe(false);
  });
});
