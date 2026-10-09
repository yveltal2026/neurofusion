import { interpretD } from "./dscore";
import type { PreferenceDirection, PreferenceStrength } from "./dscore";
import { mean, oneSampleTTest } from "./math";
import type { OneSampleTest } from "./math";

/**
 * Agregados determinísticos de un estudio. Este es el ÚNICO insumo numérico que
 * recibe el análisis con IA: nunca filas crudas ni datos personales.
 */

export type ExplicitPreference = "A" | "B" | "neutral";
export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface SessionDimensionResult {
  d: number | null;
  valid: boolean;
}

export interface SessionForStats {
  id: string;
  deviceType: DeviceType;
  /** Variables categóricas ya discretizadas (p. ej. edad en rangos, género). */
  segments: Record<string, string>;
  explicit: ExplicitPreference | null;
  /** Excluida manualmente por el investigador (p. ej. duplicado). */
  excluded: boolean;
  /** Un elemento por dimensión, en el orden del estudio. */
  dimensions: SessionDimensionResult[];
}

export interface AggregateOptions {
  dimensionLabels: string[];
  /** Grupos con menos sesiones se suprimen del desglose. Default 5. */
  minGroupSize?: number;
  /** Incluir dimensiones con datos de calidad dudosa. Default false. */
  includeInvalid?: boolean;
  /** Ancho de clase del histograma de D. Default 0.25 en [-2, 2]. */
  histogramBinWidth?: number;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export interface ConcordanceCounts {
  n: number;
  consistent: number;
  dissonant: number;
  partial: number;
}

export interface DimensionAggregate {
  index: number | "overall";
  label: string;
  /** Participantes con un D utilizable en esta dimensión. */
  n: number;
  test: OneSampleTest | null;
  strengthCounts: Record<PreferenceStrength, number>;
  directionCounts: Record<PreferenceDirection, number>;
  histogram: HistogramBin[];
  concordance: ConcordanceCounts;
}

export interface GroupSlice {
  group: string;
  nSessions: number;
  /** Media de D por dimensión (null si el grupo no tiene datos en esa dimensión). */
  meanD: (number | null)[];
  overallMeanD: number | null;
}

export interface SegmentBreakdown {
  variable: string;
  groups: GroupSlice[];
  /** Nº de grupos omitidos por tener menos de `minGroupSize` sesiones. */
  suppressedGroups: number;
}

export interface StudyAggregates {
  nSessions: number;
  nExcluded: number;
  nWithUsableData: number;
  minGroupSize: number;
  includeInvalid: boolean;
  dimensions: DimensionAggregate[];
  overall: DimensionAggregate;
  deviceMix: Record<DeviceType, number>;
  byDevice: SegmentBreakdown;
  bySegment: SegmentBreakdown[];
  /** Cuántas sesiones usan cada respuesta explícita. */
  explicitCounts: Record<ExplicitPreference | "missing", number>;
}

function usable(
  session: SessionForStats,
  index: number,
  includeInvalid: boolean,
): number | null {
  if (session.excluded) return null;
  const dim = session.dimensions[index];
  if (!dim || dim.d === null || !Number.isFinite(dim.d)) return null;
  if (!includeInvalid && !dim.valid) return null;
  return dim.d;
}

/** D compuesto por sesión: media de los D utilizables de sus dimensiones. */
function compositeD(
  session: SessionForStats,
  nDims: number,
  includeInvalid: boolean,
): number | null {
  const values: number[] = [];
  for (let i = 0; i < nDims; i++) {
    const v = usable(session, i, includeInvalid);
    if (v !== null) values.push(v);
  }
  return values.length ? mean(values) : null;
}

export function classifyConcordance(
  implicit: PreferenceDirection,
  explicit: ExplicitPreference,
): "consistent" | "dissonant" | "partial" {
  if (implicit === "none") return explicit === "neutral" ? "consistent" : "partial";
  if (explicit === "neutral") return "partial";
  return implicit === explicit ? "consistent" : "dissonant";
}

function buildHistogram(values: number[], width: number): HistogramBin[] {
  const min = -2;
  const max = 2;
  const nBins = Math.round((max - min) / width);
  const bins: HistogramBin[] = Array.from({ length: nBins }, (_, i) => ({
    from: round(min + i * width),
    to: round(min + (i + 1) * width),
    count: 0,
  }));
  for (const v of values) {
    const clamped = Math.min(Math.max(v, min), max - 1e-9);
    bins[Math.floor((clamped - min) / width)].count++;
  }
  return bins;
}

function round(x: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function aggregateValues(
  index: number | "overall",
  label: string,
  rows: { d: number; explicit: ExplicitPreference | null }[],
  width: number,
): DimensionAggregate {
  const values = rows.map((r) => r.d);
  const strengthCounts: Record<PreferenceStrength, number> = {
    none: 0,
    slight: 0,
    moderate: 0,
    strong: 0,
  };
  const directionCounts: Record<PreferenceDirection, number> = { A: 0, B: 0, none: 0 };
  const concordance: ConcordanceCounts = { n: 0, consistent: 0, dissonant: 0, partial: 0 };

  for (const row of rows) {
    const interp = interpretD(row.d);
    strengthCounts[interp.strength]++;
    directionCounts[interp.direction]++;
    if (row.explicit) {
      concordance.n++;
      concordance[classifyConcordance(interp.direction, row.explicit)]++;
    }
  }

  return {
    index,
    label,
    n: values.length,
    test: oneSampleTTest(values),
    strengthCounts,
    directionCounts,
    histogram: buildHistogram(values, width),
    concordance,
  };
}

function breakdown(
  variable: string,
  sessions: SessionForStats[],
  keyOf: (s: SessionForStats) => string | undefined,
  nDims: number,
  minGroupSize: number,
  includeInvalid: boolean,
): SegmentBreakdown {
  const groups = new Map<string, SessionForStats[]>();
  for (const s of sessions) {
    if (s.excluded) continue;
    const key = keyOf(s);
    if (key === undefined || key === "") continue;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const slices: GroupSlice[] = [];
  let suppressedGroups = 0;
  for (const [group, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length < minGroupSize) {
      suppressedGroups++;
      continue;
    }
    const meanD = Array.from({ length: nDims }, (_, i) => {
      const vals = list
        .map((s) => usable(s, i, includeInvalid))
        .filter((v): v is number => v !== null);
      return vals.length ? round(mean(vals)) : null;
    });
    const composites = list
      .map((s) => compositeD(s, nDims, includeInvalid))
      .filter((v): v is number => v !== null);
    slices.push({
      group,
      nSessions: list.length,
      meanD,
      overallMeanD: composites.length ? round(mean(composites)) : null,
    });
  }
  return { variable, groups: slices, suppressedGroups };
}

export function computeStudyAggregates(
  sessions: SessionForStats[],
  options: AggregateOptions,
): StudyAggregates {
  const nDims = options.dimensionLabels.length;
  const minGroupSize = options.minGroupSize ?? 5;
  const includeInvalid = options.includeInvalid ?? false;
  const width = options.histogramBinWidth ?? 0.25;

  const dimensions: DimensionAggregate[] = options.dimensionLabels.map((label, i) => {
    const rows = sessions.flatMap((s) => {
      const d = usable(s, i, includeInvalid);
      return d === null ? [] : [{ d, explicit: s.explicit }];
    });
    return aggregateValues(i, label, rows, width);
  });

  const overallRows = sessions.flatMap((s) => {
    const d = compositeD(s, nDims, includeInvalid);
    return d === null ? [] : [{ d, explicit: s.explicit }];
  });

  const deviceMix: Record<DeviceType, number> = {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    unknown: 0,
  };
  const explicitCounts: Record<ExplicitPreference | "missing", number> = {
    A: 0,
    B: 0,
    neutral: 0,
    missing: 0,
  };
  for (const s of sessions) {
    if (s.excluded) continue;
    deviceMix[s.deviceType]++;
    explicitCounts[s.explicit ?? "missing"]++;
  }

  const segmentVars = [
    ...new Set(sessions.flatMap((s) => Object.keys(s.segments))),
  ].sort();

  return {
    nSessions: sessions.length,
    nExcluded: sessions.filter((s) => s.excluded).length,
    nWithUsableData: overallRows.length,
    minGroupSize,
    includeInvalid,
    dimensions,
    overall: aggregateValues("overall", "Compuesto", overallRows, width),
    deviceMix,
    byDevice: breakdown(
      "device",
      sessions,
      (s) => s.deviceType,
      nDims,
      minGroupSize,
      includeInvalid,
    ),
    bySegment: segmentVars.map((variable) =>
      breakdown(variable, sessions, (s) => s.segments[variable], nDims, minGroupSize, includeInvalid),
    ),
    explicitCounts,
  };
}

