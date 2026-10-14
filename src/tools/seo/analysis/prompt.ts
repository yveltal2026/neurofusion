import { RULES, type AuditSummary, type Finding, type PageSummary, type PerformanceResult } from "../engine";
import { SEO_RESULT_FORMAT } from "./schema";

export const SEO_SYSTEM_PROMPT = `Eres un consultor SEO técnico senior que trabaja con analistas en México. Redactas, en español, un plan de acción a partir de una auditoría automática ya calculada.

REGLAS
1. Usa ÚNICAMENTE los hallazgos, páginas y métricas del JSON recibido. No inventes problemas, cifras, volúmenes de búsqueda ni posiciones. Si algo no se midió, dilo en "limitations".
2. Prioriza por impacto en indexación y tráfico: primero lo que impide indexar o rastrear (noindex, bloqueos, errores 4xx/5xx), luego contenido on-page, luego rendimiento y mejoras menores.
3. Cada prioridad agrupa hallazgos relacionados, explica el porqué citándolos y da pasos concretos que un desarrollador o editor pueda ejecutar. Indica impacto y esfuerzo estimados.
4. "rewrites": propone hasta 10 reescrituras de títulos, descripciones o H1 SÓLO para las páginas listadas, con el texto actual tal cual. Respeta la palabra clave objetivo si existe; títulos de 30-60 caracteres y descripciones de 70-160. Son propuestas para revisión humana.
5. Si la auditoría fue en modo asistido (HTML subido), no opines sobre robots, sitemaps, códigos HTTP ni rendimiento.
6. Sé directo y concreto; sin relleno.

FORMATO
Responde SOLO con un objeto JSON válido, sin texto adicional, con esta estructura:
${SEO_RESULT_FORMAT}`;

/** Agrupa hallazgos que fallan por regla para no repetir la misma observación por cada URL. */
export function groupFailing(findings: Finding[]) {
  const by = new Map<string, { rule: string; severity: string; element: string; urls: string[]; examples: string[] }>();
  for (const f of findings) {
    if (f.severity === "ok") continue;
    const key = `${f.rule}|${f.severity}`;
    const g = by.get(key) ?? { rule: f.rule, severity: f.severity, element: f.element, urls: [], examples: [] };
    if (f.url) g.urls.push(f.url);
    if (g.examples.length < 3) g.examples.push(f.detail);
    by.set(key, g);
  }
  return [...by.values()].map((g) => ({
    regla: g.rule,
    severidad: g.severity,
    elemento: g.element,
    paginasAfectadas: g.urls.length,
    ejemplos: g.examples,
    urls: g.urls.slice(0, 5),
  }));
}

export function buildSeoUserPrompt(input: {
  siteUrl: string;
  mode: "live" | "upload";
  targetKeyword: string | null;
  summary: AuditSummary;
  findings: Finding[];
  pages: PageSummary[];
  performance: PerformanceResult | null;
  notes: string[];
}): string {
  const payload = {
    sitio: input.siteUrl,
    modo: input.mode === "live" ? "rastreo en vivo" : "asistido (HTML subido)",
    palabraClaveObjetivo: input.targetKeyword,
    puntuacion: input.summary.score,
    conteos: input.summary.counts,
    porCategoria: input.summary.byCategory,
    hallazgos: groupFailing(input.findings),
    reglasCorrectas: [...new Set(input.findings.filter((f) => f.severity === "ok").map((f) => f.rule))],
    paginas: input.pages.slice(0, 25).map((p) => ({ url: p.url, estado: p.status, titulo: p.title, descripcion: p.metaDescription, h1: p.h1, palabras: p.wordCount })),
    rendimiento: input.performance
      ? {
          estrategia: input.performance.strategy,
          puntuacion: input.performance.performanceScore,
          laboratorio: input.performance.lab,
          campo: input.performance.field,
          oportunidades: input.performance.opportunities,
        }
      : null,
    notas: input.notes,
    catalogoReglas: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.element])),
  };
  return `Redacta el plan de acción SEO de esta auditoría.\n\n${JSON.stringify(payload, null, 1)}`;
}
