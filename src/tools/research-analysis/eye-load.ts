import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import { loadAssets } from "@/tools/visual/results";
import {
  eyeQualitySchema,
  eyeObservationSchema,
} from "@/tools/visual/eye/schema";
import {
  aggregateEyeMetrics,
  EYE_METRICS_VERSION,
  mean,
} from "@/tools/visual/eye/metrics";

/** Only aggregates leave this loader; raw coordinates and participant codes never reach AI. */
export async function loadEyeAggregates(
  supabase: SupabaseClient,
  studyId: string,
  batterySessionIds?: readonly string[],
) {
  const [assets, sessions, runs] = await Promise.all([
    loadAssets(supabase, studyId),
    fetchAll<{
      id: string;
      excluded: boolean;
      battery_session_id: string | null;
    }>((from, to) =>
      supabase
        .from("sessions")
        .select("id, excluded, battery_session_id")
        .eq("study_id", studyId)
        .eq("status", "completed")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      session_id: string;
      validation: unknown;
      observations: unknown;
    }>((from, to) =>
      supabase
        .from("eye_tracking_runs")
        .select("session_id, validation, observations")
        .eq("study_id", studyId)
        .order("session_id")
        .range(from, to),
    ),
  ]);
  const scoped = sessions.filter(
    (s) =>
      !batterySessionIds ||
      (s.battery_session_id &&
        batterySessionIds.includes(s.battery_session_id)),
  );
  const eligible = new Set(scoped.filter((s) => !s.excluded).map((s) => s.id));
  const batteryBySession = new Map(
    scoped.map((s) => [s.id, s.battery_session_id]),
  );
  const seenBatteryParticipants = new Set<string>();
  const usable = runs.flatMap((run) => {
    const quality = eyeQualitySchema.safeParse(run.validation);
    const observations = eyeObservationSchema
      .array()
      .safeParse(run.observations);
    const accepted =
      eligible.has(run.session_id) &&
      quality.success &&
      quality.data.passed &&
      quality.data.measurementStatus !== "limited" &&
      observations.success &&
      observations.data.some((o) => o.samples.length > 0);
    if (!accepted || !observations.success) return [];
    const batteryParticipant = batteryBySession.get(run.session_id);
    if (batterySessionIds && batteryParticipant) {
      if (seenBatteryParticipants.has(batteryParticipant)) return [];
      seenBatteryParticipants.add(batteryParticipant);
    }
    return [{ id: run.session_id, observations: observations.data }];
  });
  const nTotal = batterySessionIds
    ? new Set(scoped.map((s) => s.battery_session_id)).size
    : scoped.length;
  return {
    engineVersion: EYE_METRICS_VERSION,
    nTotal,
    nIncluded: usable.length,
    nExcludedOrLowQuality: nTotal - usable.length,
    pieces: assets.map((asset) => {
      const measurements = usable.flatMap((r) =>
        r.observations
          .filter((o) => o.assetId === asset.row.id)
          .map((observation) => ({
            sessionId: r.id,
            participant: "",
            observation,
          })),
      );
      const aggregate = aggregateEyeMetrics(measurements, asset.aois, {
        width: asset.row.width,
        height: asset.row.height,
      });
      return {
        title: asset.row.title,
        n: aggregate.count,
        withoutFixations: aggregate.withoutFixations,
        meanFixationCount: mean(
          aggregate.participants.map((p) => p.metrics.fixations.length),
        ),
        meanTotalFixationDurationMs: mean(
          aggregate.participants.map((p) =>
            p.metrics.fixations.reduce((sum, f) => sum + f.durationMs, 0),
          ),
        ),
        meanFixationDurationMs: mean(
          aggregate.participants.flatMap((p) =>
            p.metrics.fixations.map((f) => f.durationMs),
          ),
        ),
        aois: aggregate.aois,
      };
    }),
  };
}
