import type { StudyAggregates } from "../engine/stats";

export interface AnalysisWarning {
  level: "error" | "warning" | "info";
  text: string;
}

export interface SessionCounts {
  /** Sesiones completadas (incluye excluidas e inválidas). */
  completed: number;
  /** Completadas con alguna dimensión de calidad dudosa. */
  invalidCompleted: number;
  duplicatesFlagged: number;
}

/** Advertencias deterministas (no dependen de la IA) que acompañan siempre al análisis. */
export function buildWarnings(agg: StudyAggregates, counts: SessionCounts): AnalysisWarning[] {
  const out: AnalysisWarning[] = [];
  const n = agg.nWithUsableData;

  if (n === 0) {
    out.push({ level: "error", text: "Todavía no hay participantes con datos utilizables para analizar." });
    return out;
  }
  if (n < 10) {
    out.push({ level: "warning", text: `Muestra muy pequeña (n = ${n}): los resultados son sólo ilustrativos y no permiten generalizar.` });
  } else if (n < 30) {
    out.push({ level: "warning", text: `Muestra pequeña (n = ${n}): los intervalos de confianza son amplios; interpreta con cautela.` });
  }

  for (const d of agg.dimensions) {
    if (d.n > 0 && d.test === null) {
      out.push({ level: "warning", text: `«${d.label}»: no hay variación suficiente para estimar significancia (n = ${d.n}).` });
    }
  }

  if (!agg.includeInvalid && counts.invalidCompleted > 0) {
    out.push({
      level: "info",
      text: `${counts.invalidCompleted} sesión(es) con calidad de datos dudosa se omiten de las dimensiones afectadas (puedes incluirlas).`,
    });
  }
  if (agg.nExcluded > 0) {
    out.push({ level: "info", text: `${agg.nExcluded} sesión(es) fueron excluidas manualmente del análisis.` });
  }
  if (counts.duplicatesFlagged > 0) {
    out.push({
      level: "warning",
      text: `${counts.duplicatesFlagged} sesión(es) están marcadas como posibles duplicados (misma IP y navegador). Revísalas en la pestaña Datos y exclúyelas si corresponde.`,
    });
  }

  const touch = agg.deviceMix.mobile + agg.deviceMix.tablet;
  const totalDevices = touch + agg.deviceMix.desktop + agg.deviceMix.unknown;
  if (totalDevices > 0 && touch / totalDevices >= 0.2) {
    out.push({
      level: "warning",
      text: `${Math.round((touch / totalDevices) * 100)} % de las sesiones vienen de celular o tableta: los tiempos táctiles son más lentos y ruidosos que con teclado, lo que puede afectar la comparabilidad.`,
    });
  }
  return out;
}
