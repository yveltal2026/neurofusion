import { toCsv } from "@/lib/csv";
import type { IatConfig } from "../config";
import type { DeviceType, ExplicitPreference, SessionForStats } from "../engine/stats";
import { sessionSegments } from "../participant";

/** Filas tal como salen de Supabase. */
export interface SessionRow {
  id: string;
  participant_ref: string;
  status: "started" | "completed" | "abandoned";
  demographics: Record<string, unknown> | null;
  explicit_preference: ExplicitPreference | null;
  input_mode: "keyboard" | "touch" | null;
  device_type: DeviceType;
  screen_width: number | null;
  screen_height: number | null;
  duplicate_flag: boolean;
  excluded: boolean;
  excluded_reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ResultRow {
  session_id: string;
  dimension_idx: number;
  first_combo: "A_with_P1" | "A_with_P2";
  d_score: number | null;
  strength: "none" | "slight" | "moderate" | "strong" | null;
  direction: "A" | "B" | "none" | null;
  error_rate: number;
  fast_fraction: number;
  n_used: number;
  n_trials: number;
  valid: boolean;
  flags: string[];
}

export interface TrialExportRow {
  session_id: string;
  dimension_idx: number;
  block: number;
  trial_idx: number;
  category: string;
  stimulus: string;
  correct_side: string;
  pressed_side: string | null;
  rt_ms: number;
  error: boolean;
}

export interface SessionView extends SessionRow {
  /** Un resultado por dimensión del estudio (null si no hay). */
  dimensions: (ResultRow | null)[];
  /** true si todas las dimensiones son válidas; null si no hay resultados. */
  allValid: boolean | null;
}

export function buildSessionViews(config: IatConfig, sessions: SessionRow[], results: ResultRow[]): SessionView[] {
  const bySession = new Map<string, ResultRow[]>();
  for (const r of results) {
    const list = bySession.get(r.session_id) ?? [];
    list.push(r);
    bySession.set(r.session_id, list);
  }
  return sessions.map((s) => {
    const rows = bySession.get(s.id) ?? [];
    const dimensions = config.dimensions.map((_, i) => rows.find((r) => r.dimension_idx === i) ?? null);
    const present = dimensions.filter((d): d is ResultRow => d !== null);
    return { ...s, dimensions, allValid: present.length ? present.every((d) => d.valid) : null };
  });
}

export interface ViewFilters {
  status?: SessionRow["status"] | "all";
  validity?: "valid" | "invalid" | "all";
  device?: DeviceType | "all";
  duplicates?: "only" | "all";
  excluded?: "only" | "hide" | "all";
}

export function filterViews(views: SessionView[], f: ViewFilters): SessionView[] {
  return views.filter((v) => {
    if (f.status && f.status !== "all" && v.status !== f.status) return false;
    if (f.validity === "valid" && v.allValid !== true) return false;
    if (f.validity === "invalid" && v.allValid !== false) return false;
    if (f.device && f.device !== "all" && v.device_type !== f.device) return false;
    if (f.duplicates === "only" && !v.duplicate_flag) return false;
    if (f.excluded === "only" && !v.excluded) return false;
    if (f.excluded === "hide" && v.excluded) return false;
    return true;
  });
}

/** Sesiones completadas, en el formato que consumen los agregados del motor. */
export function toStatsSessions(config: IatConfig, views: SessionView[]): SessionForStats[] {
  return views
    .filter((v) => v.status === "completed")
    .map((v) => ({
      id: v.id,
      deviceType: v.device_type,
      segments: sessionSegments(config, v.demographics ?? {}),
      explicit: v.explicit_preference,
      excluded: v.excluded,
      dimensions: v.dimensions.map((d) => ({ d: d?.d_score ?? null, valid: d?.valid ?? false })),
    }));
}

// ------------------------------------------------------------------ CSV

const round = (n: number | null, digits = 4) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

/** session_summary.csv: una fila por sesión. No incluye device_id, IP ni user agent. */
export function sessionSummaryCsv(config: IatConfig, views: SessionView[]): string {
  const extraIds = config.participant.extraFields.map((f) => f.id);
  const dimHeaders = config.dimensions.flatMap((d) =>
    ["d", "strength", "direction", "valid", "flags", "error_rate", "pct_under_300ms", "n_used", "first_combo"].map((k) => `${d.id}_${k}`),
  );
  const headers = [
    "session_ref", "status", "started_at", "completed_at", "device_type", "input_mode", "screen_width", "screen_height",
    "duplicate_flag", "excluded", "excluded_reason", "explicit_preference", "age", "gender", ...extraIds, ...dimHeaders,
  ];
  const rows = views.map((v) => {
    const demo = v.demographics ?? {};
    const dims = v.dimensions.flatMap((r) =>
      r
        ? [round(r.d_score), r.strength, r.direction, r.valid, r.flags.join("|"), round(r.error_rate), round(r.fast_fraction * 100, 2), r.n_used, r.first_combo]
        : Array(9).fill(null),
    );
    return [
      v.participant_ref, v.status, v.started_at, v.completed_at, v.device_type, v.input_mode, v.screen_width, v.screen_height,
      v.duplicate_flag, v.excluded, v.excluded_reason,
      v.explicit_preference === "A" ? config.conceptA.label : v.explicit_preference === "B" ? config.conceptB.label : v.explicit_preference,
      demo.age as number | undefined, demo.gender as string | undefined,
      ...extraIds.map((id) => demo[id] as string | number | undefined),
      ...dims,
    ];
  });
  return toCsv(headers, rows);
}

/** raw_trials.csv: una fila por ensayo. */
export function rawTrialsCsv(config: IatConfig, refBySession: Map<string, string>, trials: TrialExportRow[]): string {
  const headers = [
    "session_ref", "dimension_id", "dimension_name", "block", "trial_idx", "category", "stimulus",
    "correct_side", "pressed_side", "rt_ms", "error",
  ];
  const rows = trials.map((t) => [
    refBySession.get(t.session_id) ?? "",
    config.dimensions[t.dimension_idx]?.id ?? String(t.dimension_idx),
    config.dimensions[t.dimension_idx]?.name ?? "",
    t.block, t.trial_idx, t.category, t.stimulus, t.correct_side, t.pressed_side, round(t.rt_ms, 1), t.error,
  ]);
  return toCsv(headers, rows);
}
