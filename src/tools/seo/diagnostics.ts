import {
  ruleDef,
  sortFindings,
  summarize,
  type Finding,
  type PageSummary,
} from "./engine";

/** Resumen verificable sin depender de generar un plan con IA. */
export function diagnosticFindings(findings: Finding[]) {
  const ordered = sortFindings(findings);
  const unique = (rows: Finding[]) => {
    const seen = new Set<string>();
    return rows
      .filter((f) => {
        if (seen.has(f.rule)) return false;
        seen.add(f.rule);
        return true;
      })
      .slice(0, 3);
  };
  return {
    strengths: unique(
      ordered.filter((f) => f.severity === "ok" && !f.advisory),
    ),
    weaknesses: unique(
      ordered.filter((f) => f.severity !== "ok" && !f.advisory),
    ),
    contextual: ordered.filter((f) => f.advisory),
  };
}

export function pageDiagnostic(page: PageSummary, findings: Finding[]) {
  const own = findings.filter((f) => f.url === page.url);
  return {
    ...diagnosticFindings(own),
    findings: own,
    summary: summarize(own, page.wordCount === null ? 0 : 1),
  };
}

export function recommendation(finding: Finding) {
  return (
    ruleDef(finding.rule)?.advice ??
    "Revisa la evidencia y confirma el comportamiento esperado de esta página."
  );
}
