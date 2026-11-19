import { FACIAL_CODING_VERSION } from "@/lab/facial/blendshapes";
import type { Fixation, ImageSize } from "../eye/metrics";
import type { HeatCell } from "../eye/heatmap";
import type {
  NormalizedBox,
  VideoAoi,
  VideoFacialSample,
  VideoObservation,
  VideoScene,
} from "./schema";

export const VIDEO_EYE_METRICS_VERSION = "idt-video-v1";

export const VIDEO_GAZE_RULES = {
  minDurationMs: 100,
  maxGapMs: 120,
  /** Tolerancia mayor que en imagen fija (0.035) para admitir seguimiento suave (smooth pursuit). */
  dispersionDiagonal: 0.05,
  /** Ventana fisiológica tras fijar una AOI durante la cual se atribuye la respuesta facial. */
  affectLagMs: 300,
} as const;

export const AU_KEYS = [
  "au01",
  "au02",
  "au04",
  "au06",
  "au07",
  "au09",
  "au10",
  "au12",
  "au14",
  "au15",
  "au24",
  "au26",
] as const;

export type AuKey = (typeof AU_KEYS)[number];
export type FacialActionUnitsSummary = Readonly<Record<AuKey, number>>;

export interface FacialIndicesSummary {
  smile: number;
  friction: number;
  valence: number;
  surprise: number;
  expressiveness: number;
  aus: FacialActionUnitsSummary;
}

export interface VideoAoiMetrics {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  ttffMs: number | null;
  fixationCount: number;
  totalFixationDurationMs: number;
  dwellTimeMs: number;
  visitCount: number;
  revisitCount: number;
  /** Índices afectivos y 12 FACS AUs medidos mientras la mirada estaba dentro de la AOI (+ affectLagMs). */
  affectWhileLooking: FacialIndicesSummary | null;
}

export interface VideoSceneMetrics {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  gazeCoverageRatio: number;
  fixationCount: number;
  blinkCount: number;
  blinkRatePerMin: number;
  meanAffect: FacialIndicesSummary | null;
}

export interface VideoTimelineBin {
  startMs: number;
  endMs: number;
  activeGazeRatio: number;
  meanValence: number | null;
  meanSmile: number | null;
  meanFriction: number | null;
  meanSurprise: number | null;
  meanExpressiveness: number | null;
  meanAus: FacialActionUnitsSummary | null;
  blinkRatePct: number | null;
}

export interface VideoParticipantMetrics {
  fixations: Fixation[];
  aois: VideoAoiMetrics[];
  scenes: VideoSceneMetrics[];
  timeline: VideoTimelineBin[];
}

export interface VideoParticipantInput {
  sessionId: string;
  participant: string;
  observation: VideoObservation;
}

export interface AggregateVideoAoi extends Omit<
  VideoAoiMetrics,
  "affectWhileLooking"
> {
  viewers: number;
  hitRatePct: number | null;
  affectWhileLooking: FacialIndicesSummary | null;
}

export interface AggregateVideoScene {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  meanGazeCoverageRatio: number;
  meanFixationCount: number;
  meanBlinkRatePerMin: number;
  meanAffect: FacialIndicesSummary | null;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function averageAusSummaries(
  items: FacialActionUnitsSummary[],
): FacialActionUnitsSummary | null {
  if (!items.length) return null;
  const out = {} as Record<AuKey, number>;
  for (const key of AU_KEYS) {
    out[key] = round2(mean(items.map((i) => i[key]))!);
  }
  return out;
}

/** Calcula los 4 índices compuestos + expresividad y conserva las 12 FACS AUs de una muestra. */
export function sampleAffectIndices(
  s: VideoFacialSample,
): FacialIndicesSummary {
  const smile = Math.min(
    100,
    Math.max(0, Math.round(0.65 * s.au12 + 0.35 * s.au06)),
  );
  const friction = Math.max(s.au04, s.au09, s.au10, s.au15);
  const valence = Math.min(100, Math.max(-100, smile - friction));
  const surprise = Math.min(
    100,
    Math.max(0, Math.round(Math.sqrt(((s.au01 + s.au02) / 2) * s.au26))),
  );
  const aus: FacialActionUnitsSummary = {
    au01: s.au01,
    au02: s.au02,
    au04: s.au04,
    au06: s.au06,
    au07: s.au07,
    au09: s.au09,
    au10: s.au10,
    au12: s.au12,
    au14: s.au14,
    au15: s.au15,
    au24: s.au24,
    au26: s.au26,
  };
  const values = Object.values(aus);
  const rms = Math.sqrt(
    values.reduce((acc, v) => acc + v * v, 0) / values.length,
  );
  const expressiveness = Math.min(100, Math.max(0, Math.round(rms)));
  return { smile, friction, valence, surprise, expressiveness, aus };
}

export function averageAffectSummaries(
  items: FacialIndicesSummary[],
): FacialIndicesSummary | null {
  if (!items.length) return null;
  return {
    smile: round2(mean(items.map((i) => i.smile))!),
    friction: round2(mean(items.map((i) => i.friction))!),
    valence: round2(mean(items.map((i) => i.valence))!),
    surprise: round2(mean(items.map((i) => i.surprise))!),
    expressiveness: round2(mean(items.map((i) => i.expressiveness))!),
    aus: averageAusSummaries(items.map((i) => i.aus))!,
  };
}

/**
 * Resuelve la caja [x0, y0, x1, y1] de una AOI en el instante `tMs`.
 * Devuelve `null` si `tMs` está fuera de `[aoi.startMs, aoi.endMs]`.
 * Si la AOI define keyframes, interpola linealmente entre los dos keyframes adyacentes.
 */
export function resolveVideoAoiBox(
  aoi: VideoAoi,
  tMs: number,
): NormalizedBox | null {
  if (tMs < aoi.startMs || tMs > aoi.endMs) return null;
  const kfs = aoi.keyframes;
  if (!kfs || kfs.length === 0) return aoi.box;
  if (tMs <= kfs[0].tMs) return kfs[0].box;
  const last = kfs[kfs.length - 1];
  if (tMs >= last.tMs) return last.box;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs;
      if (span <= 0) return a.box;
      const alpha = (tMs - a.tMs) / span;
      return [
        a.box[0] + (b.box[0] - a.box[0]) * alpha,
        a.box[1] + (b.box[1] - a.box[1]) * alpha,
        a.box[2] + (b.box[2] - a.box[2]) * alpha,
        a.box[3] + (b.box[3] - a.box[3]) * alpha,
      ];
    }
  }
  return aoi.box;
}

function insideAtTime(
  point: { x: number; y: number },
  tMs: number,
  aoi: VideoAoi,
): boolean {
  const box = resolveVideoAoiBox(aoi, tMs);
  if (!box) return false;
  return (
    point.x >= box[0] &&
    point.x <= box[2] &&
    point.y >= box[1] &&
    point.y <= box[3]
  );
}

/**
 * Detecta fijaciones y seguimientos suaves acotados en video (`idt-video-v1`).
 */
export function detectVideoGazeEvents(
  observation: VideoObservation,
  size: ImageSize,
): Fixation[] {
  const points = observation.gazeSamples;
  const diagonal = Math.hypot(size.width, size.height);
  if (!(diagonal > 0)) return [];
  const result: Fixation[] = [];
  const dispersion = (from: number, to: number) => {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let k = from; k <= to; k++) {
      x0 = Math.min(x0, points[k].x);
      x1 = Math.max(x1, points[k].x);
      y0 = Math.min(y0, points[k].y);
      y1 = Math.max(y1, points[k].y);
    }
    return (
      Math.hypot((x1 - x0) * size.width, (y1 - y0) * size.height) / diagonal
    );
  };
  const contiguous = (k: number) =>
    points[k].t > points[k - 1].t &&
    points[k].t - points[k - 1].t <= VIDEO_GAZE_RULES.maxGapMs;

  let i = 0;
  while (i < points.length) {
    let j = i;
    while (
      j + 1 < points.length &&
      points[j].t - points[i].t < VIDEO_GAZE_RULES.minDurationMs &&
      contiguous(j + 1)
    ) {
      j++;
    }
    if (
      points[j].t - points[i].t < VIDEO_GAZE_RULES.minDurationMs ||
      dispersion(i, j) > VIDEO_GAZE_RULES.dispersionDiagonal
    ) {
      i++;
      continue;
    }
    while (
      j + 1 < points.length &&
      contiguous(j + 1) &&
      dispersion(i, j + 1) <= VIDEO_GAZE_RULES.dispersionDiagonal
    ) {
      j++;
    }
    const durationMs = points[j].t - points[i].t;
    let x = 0,
      y = 0;
    for (let k = i; k < j; k++) {
      const dt = points[k + 1].t - points[k].t;
      x += ((points[k].x + points[k + 1].x) / 2) * dt;
      y += ((points[k].y + points[k + 1].y) / 2) * dt;
    }
    result.push({
      x: x / durationMs,
      y: y / durationMs,
      startMs: points[i].t,
      endMs: points[j].t,
      durationMs,
      samples: j - i + 1,
    });
    i = j + 1;
  }
  return result;
}

/** Cuenta episodios discretos de parpadeo (transiciones false -> true en `blink`). */
export function countBlinkEpisodes(
  samples: readonly VideoFacialSample[],
): number {
  let count = 0;
  let inBlink = false;
  for (const s of samples) {
    if (s.blink && !inBlink) {
      count++;
      inBlink = true;
    } else if (!s.blink) {
      inBlink = false;
    }
  }
  return count;
}

export function measureVideoObservation(
  observation: VideoObservation,
  config: { aois: VideoAoi[]; scenes: VideoScene[]; binMs?: number },
  size: ImageSize,
): VideoParticipantMetrics {
  const binMs = Math.max(100, config.binMs ?? 1000);
  const fixations = detectVideoGazeEvents(observation, size);
  const validFacial = observation.facialSamples.filter((s) => s.poseValid);

  const aois: VideoAoiMetrics[] = config.aois.map((aoi) => {
    const hits = fixations.filter((f) => {
      const midT = (f.startMs + f.endMs) / 2;
      return insideAtTime(f, midT, aoi);
    });
    let visitCount = 0;
    let dwellTimeMs = 0;
    let previous: Fixation | undefined;
    for (const hit of hits) {
      const between = previous
        ? observation.gazeSamples.filter(
            (p) => p.t >= previous!.endMs && p.t <= hit.startMs,
          )
        : [];
      const continues =
        previous &&
        between.every(
          (p, k) =>
            insideAtTime(p, p.t, aoi) &&
            (k === 0 ||
              (p.t > between[k - 1].t &&
                p.t - between[k - 1].t <= VIDEO_GAZE_RULES.maxGapMs)),
        );
      if (continues) dwellTimeMs += hit.startMs - previous!.endMs;
      else visitCount++;
      dwellTimeMs += hit.durationMs;
      previous = hit;
    }
    const totalFixationDurationMs = hits.reduce(
      (n, f) => n + f.durationMs,
      0,
    );

    // Gaze-Locked Affect: muestras faciales válidas dentro de [hit.startMs, hit.endMs + affectLagMs]
    const matchedFacial = validFacial.filter((fs) =>
      hits.some(
        (h) =>
          fs.t >= h.startMs &&
          fs.t <= h.endMs + VIDEO_GAZE_RULES.affectLagMs,
      ),
    );
    const affectWhileLooking = averageAffectSummaries(
      matchedFacial.map(sampleAffectIndices),
    );

    return {
      id: aoi.id,
      label: aoi.label,
      startMs: aoi.startMs,
      endMs: aoi.endMs,
      ttffMs: hits.length ? Math.max(0, hits[0].startMs - aoi.startMs) : null,
      fixationCount: hits.length,
      totalFixationDurationMs,
      dwellTimeMs,
      visitCount,
      revisitCount: Math.max(0, visitCount - 1),
      affectWhileLooking,
    };
  });

  const scenes: VideoSceneMetrics[] = config.scenes.map((scene) => {
    const sceneDurationMs = Math.max(1, scene.endMs - scene.startMs);
    const sceneFixations = fixations.filter(
      (f) => f.endMs > scene.startMs && f.startMs < scene.endMs,
    );
    const fixatedMs = sceneFixations.reduce((sum, f) => {
      const start = Math.max(scene.startMs, f.startMs);
      const end = Math.min(scene.endMs, f.endMs);
      return sum + Math.max(0, end - start);
    }, 0);
    const sceneFacialAll = observation.facialSamples.filter(
      (s) => s.t >= scene.startMs && s.t <= scene.endMs,
    );
    const sceneFacialValid = validFacial.filter(
      (s) => s.t >= scene.startMs && s.t <= scene.endMs,
    );
    const blinkCount = countBlinkEpisodes(sceneFacialAll);
    const blinkRatePerMin = round2((blinkCount * 60_000) / sceneDurationMs);

    return {
      id: scene.id,
      label: scene.label,
      startMs: scene.startMs,
      endMs: scene.endMs,
      gazeCoverageRatio: round2(Math.min(1, fixatedMs / sceneDurationMs)),
      fixationCount: sceneFixations.length,
      blinkCount,
      blinkRatePerMin,
      meanAffect: averageAffectSummaries(
        sceneFacialValid.map(sampleAffectIndices),
      ),
    };
  });

  const totalBins = Math.max(1, Math.ceil(observation.durationMs / binMs));
  const timeline: VideoTimelineBin[] = Array.from(
    { length: totalBins },
    (_, idx) => {
      const startMs = idx * binMs;
      const endMs = Math.min(observation.durationMs, (idx + 1) * binMs);
      const hasGaze = observation.gazeSamples.some(
        (g) => g.t >= startMs && g.t < endMs,
      );
      const binFacial = validFacial.filter(
        (s) => s.t >= startMs && s.t < endMs,
      );
      const binAllFacial = observation.facialSamples.filter(
        (s) => s.t >= startMs && s.t < endMs,
      );
      const summary = averageAffectSummaries(
        binFacial.map(sampleAffectIndices),
      );
      const blinkPct = binAllFacial.length
        ? round2(
            (binAllFacial.filter((s) => s.blink).length /
              binAllFacial.length) *
              100,
          )
        : null;
      return {
        startMs,
        endMs,
        activeGazeRatio: hasGaze ? 1 : 0,
        meanValence: summary?.valence ?? null,
        meanSmile: summary?.smile ?? null,
        meanFriction: summary?.friction ?? null,
        meanSurprise: summary?.surprise ?? null,
        meanExpressiveness: summary?.expressiveness ?? null,
        meanAus: summary?.aus ?? null,
        blinkRatePct: blinkPct,
      };
    },
  );

  return { fixations, aois, scenes, timeline };
}

/** Agrega métricas de mirada y expresión facial a través de múltiples participantes para un video. */
export function aggregateVideoStudy(
  input: VideoParticipantInput[],
  config: {
    durationMs: number;
    aois: VideoAoi[];
    scenes: VideoScene[];
    binMs?: number;
  },
  size: ImageSize,
) {
  const binMs = Math.max(100, config.binMs ?? 1000);
  const seen = new Set<string>();
  const participants = input
    .filter((p) => {
      if (
        (!p.observation.gazeSamples.length &&
          !p.observation.facialSamples.length) ||
        seen.has(p.sessionId)
      ) {
        return false;
      }
      seen.add(p.sessionId);
      return true;
    })
    .map((p) => ({
      ...p,
      metrics: measureVideoObservation(
        p.observation,
        { aois: config.aois, scenes: config.scenes, binMs },
        size,
      ),
    }));

  const count = participants.length;
  const aois: AggregateVideoAoi[] = config.aois.map((aoi, index) => {
    const values = participants.map((p) => p.metrics.aois[index]);
    const hits = values.filter((v) => v.fixationCount > 0);
    const affects = hits
      .map((h) => h.affectWhileLooking)
      .filter((a): a is FacialIndicesSummary => a !== null);

    return {
      id: aoi.id,
      label: aoi.label,
      startMs: aoi.startMs,
      endMs: aoi.endMs,
      viewers: hits.length,
      hitRatePct: count ? round2((hits.length / count) * 100) : null,
      ttffMs: hits.length ? round2(mean(hits.map((v) => v.ttffMs!))!) : null,
      fixationCount: count
        ? round2(values.reduce((n, v) => n + v.fixationCount, 0) / count)
        : 0,
      totalFixationDurationMs: round2(
        mean(values.map((v) => v.totalFixationDurationMs)) ?? 0,
      ),
      dwellTimeMs: round2(mean(values.map((v) => v.dwellTimeMs)) ?? 0),
      visitCount: round2(mean(values.map((v) => v.visitCount)) ?? 0),
      revisitCount: round2(mean(values.map((v) => v.revisitCount)) ?? 0),
      affectWhileLooking: averageAffectSummaries(affects),
    };
  });

  const scenes: AggregateVideoScene[] = config.scenes.map((scene, index) => {
    const values = participants.map((p) => p.metrics.scenes[index]);
    const affects = values
      .map((v) => v.meanAffect)
      .filter((a): a is FacialIndicesSummary => a !== null);
    return {
      id: scene.id,
      label: scene.label,
      startMs: scene.startMs,
      endMs: scene.endMs,
      meanGazeCoverageRatio: round2(
        mean(values.map((v) => v.gazeCoverageRatio)) ?? 0,
      ),
      meanFixationCount: round2(mean(values.map((v) => v.fixationCount)) ?? 0),
      meanBlinkRatePerMin: round2(
        mean(values.map((v) => v.blinkRatePerMin)) ?? 0,
      ),
      meanAffect: averageAffectSummaries(affects),
    };
  });

  const totalBins = Math.max(1, Math.ceil(config.durationMs / binMs));
  const timeline: VideoTimelineBin[] = Array.from(
    { length: totalBins },
    (_, idx) => {
      const startMs = idx * binMs;
      const endMs = Math.min(config.durationMs, (idx + 1) * binMs);
      const binRows = participants
        .map((p) => p.metrics.timeline[idx])
        .filter((b): b is VideoTimelineBin => Boolean(b));
      const nonNull = (
        key: Exclude<keyof VideoTimelineBin, "meanAus">,
      ): number[] =>
        binRows
          .map((r) => r[key])
          .filter((v): v is number => typeof v === "number");

      const valences = nonNull("meanValence");
      const smiles = nonNull("meanSmile");
      const frictions = nonNull("meanFriction");
      const surprises = nonNull("meanSurprise");
      const expressiveness = nonNull("meanExpressiveness");
      const blinks = nonNull("blinkRatePct");
      const ausRows = binRows
        .map((r) => r.meanAus)
        .filter((a): a is FacialActionUnitsSummary => a !== null);

      return {
        startMs,
        endMs,
        activeGazeRatio: binRows.length
          ? round2(mean(binRows.map((r) => r.activeGazeRatio))!)
          : 0,
        meanValence: valences.length ? round2(mean(valences)!) : null,
        meanSmile: smiles.length ? round2(mean(smiles)!) : null,
        meanFriction: frictions.length ? round2(mean(frictions)!) : null,
        meanSurprise: surprises.length ? round2(mean(surprises)!) : null,
        meanExpressiveness: expressiveness.length
          ? round2(mean(expressiveness)!)
          : null,
        meanAus: averageAusSummaries(ausRows),
        blinkRatePct: blinks.length ? round2(mean(blinks)!) : null,
      };
    },
  );

  return {
    methodGaze: VIDEO_EYE_METRICS_VERSION,
    methodFacial: FACIAL_CODING_VERSION,
    count,
    participants,
    aois,
    scenes,
    timeline,
  };
}

/** Construye un mapa de calor normalizado para un intervalo de tiempo [startMs, endMs] del video. */
export function buildVideoSliceHeatmap(
  observations: readonly VideoObservation[],
  startMs: number,
  endMs: number,
  columns = 32,
  rows = 20,
): HeatCell[] {
  const bins = new Array<number>(columns * rows).fill(0);
  for (const obs of observations) {
    const slice = obs.gazeSamples.filter(
      (s) => s.t >= startMs && s.t <= endMs,
    );
    if (!slice.length) continue;
    for (const s of slice) {
      const x = Math.min(columns - 1, Math.floor(s.x * columns));
      const y = Math.min(rows - 1, Math.floor(s.y * rows));
      bins[y * columns + x] += 1 / slice.length;
    }
  }
  const peak = Math.max(0, ...bins);
  if (peak === 0) return [];
  return bins.flatMap((value, i) =>
    value > 0
      ? [
          {
            x: ((i % columns) + 0.5) / columns,
            y: (Math.floor(i / columns) + 0.5) / rows,
            strength: round2(Math.sqrt(value / peak)),
          },
        ]
      : [],
  );
}
