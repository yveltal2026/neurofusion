import { CRITERIA_LABEL, type PieceAiResult } from "./piece";
import { coldZones, type Aoi } from "../engine/aoi";

const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
const FIXES: Record<keyof PieceAiResult["criteria"], string> = {
  clarity:
    "Simplifica el mensaje principal y elimina información que compita con él.",
  hierarchy:
    "Da más peso visual al mensaje y a la acción principal; ordena los elementos secundarios.",
  cta: "Haz explícita la acción y mejora el tamaño, contraste o ubicación del CTA.",
  legibility:
    "Aumenta el tamaño y contraste del texto y comprueba su lectura en el formato final.",
  brand:
    "Mejora la visibilidad y separación de la marca respecto al fondo y los elementos vecinos.",
  load: "Reduce elementos que compiten entre sí y deja más espacio alrededor de la información clave.",
};

/** Existing issues remain authoritative; criterion/AOI fallbacks let older
 * analyses surface weaknesses without fabricating a new model response. */
export function primaryFindings(result: PieceAiResult, aois: Aoi[]) {
  const weaknesses = [...result.issues];
  for (const key of Object.keys(
    CRITERIA_LABEL,
  ) as (keyof typeof CRITERIA_LABEL)[]) {
    const criterion = result.criteria[key];
    // Keep primary findings distinct when an existing issue already addresses
    // the same CTA or brand element. Its criterion score remains visible.
    const kind = key === "cta" ? "cta" : key === "brand" ? "logo" : null;
    if (
      kind &&
      result.issues.some(
        (issue) =>
          issue.elementId &&
          aois.some((aoi) => aoi.id === issue.elementId && aoi.kind === kind),
      )
    )
      continue;
    if (criterion.score <= 2)
      weaknesses.push({
        severity: criterion.score === 1 ? "high" : "medium",
        elementId: null,
        problem: `${CRITERIA_LABEL[key]} (${criterion.score}/5): ${criterion.evidence}`,
        recommendation: FIXES[key],
      });
  }
  for (const { aoi, level } of coldZones(aois)) {
    if (weaknesses.some((w) => w.elementId === aoi.id)) continue;
    weaknesses.push({
      severity: level === "blind" ? "high" : "medium",
      elementId: aoi.id,
      problem: `${aoi.label}: importancia ${aoi.importance}/5 y atracción visual estimada baja (${Math.round(aoi.attention * 5)}/5).`,
      recommendation:
        "Revisa su tamaño, contraste y posición para darle mayor visibilidad frente a los elementos que compiten con él.",
    });
  }
  const seen = new Set<string>();
  const ranked = weaknesses
    .sort((a, b) => PRIORITY[a.severity] - PRIORITY[b.severity])
    .filter((w) => {
      const key = w.problem.toLocaleLowerCase("es-MX").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const strengths = result.strengths.length
    ? result.strengths
    : (Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[])
        .filter((key) => result.criteria[key].score >= 4)
        .map(
          (key) => `${CRITERIA_LABEL[key]}: ${result.criteria[key].evidence}`,
        );
  return { strengths: strengths.slice(0, 3), weaknesses: ranked.slice(0, 3) };
}
