import { NextResponse, type NextRequest } from "next/server";
import { apiError, noStore } from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEyeMediaType } from "@/tools/visual/config";
import { loadEyeStudyByToken } from "@/tools/visual/eye/participant.server";
import { completionAllowed, eyeRunSchema, observationsMatchStudy, qualityPasses } from "@/tools/visual/eye/schema";
import { videoNeuroRunSchema } from "@/tools/visual/video/schema";
import { driftPasses } from "@/lab/eyetracking/drift";

const MAX_IMAGE_BODY_BYTES = 300_000;
const MAX_VIDEO_BODY_BYTES = 1_800_000;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/eye/complete">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`eye-complete:${clientIp(request.headers) ?? "unknown"}`, 120, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");
  const loaded = await loadEyeStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;
  const isVideo = resolveEyeMediaType(study.config.eyeTracking) === "video";

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return apiError("invalid_data");
  }
  const maxBytes = isVideo ? MAX_VIDEO_BODY_BYTES : MAX_IMAGE_BODY_BYTES;
  if (raw.length > maxBytes) return apiError("invalid_data");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return apiError("invalid_data");
  }

  let sessionId: string;
  let quality: ReturnType<typeof eyeRunSchema.parse>["quality"];
  let observations: unknown[];
  let observationCount: number;

  if (isVideo) {
    const parsedVideo = videoNeuroRunSchema.safeParse(decoded);
    if (!parsedVideo.success || !study.video) return apiError("invalid_data");
    const v = parsedVideo.data;
    if (
      v.observations.length !== 1 ||
      v.observations[0].assetId !== study.video.assetId ||
      v.observations[0].durationMs > study.video.maxDurationSeconds * 1000 + 5_000 ||
      (study.config.eyeTracking.video?.durationMs !== undefined && Math.abs(v.observations[0].durationMs - study.config.eyeTracking.video.durationMs) > 1500)
    ) {
      return apiError("invalid_data");
    }
    sessionId = v.sessionId;
    quality = v.quality;
    observations = v.observations;
    observationCount = 1;
  } else {
    const parsed = eyeRunSchema.safeParse(decoded);
    if (!parsed.success) return apiError("invalid_data");
    const input = parsed.data;
    if (!observationsMatchStudy(input.observations, study.assets.map((a) => a.id), study.config.eyeTracking.durationSeconds)) {
      return apiError("invalid_data");
    }
    if (input.quality.recovery?.repeatedAssetIds.some((id) => !study.assets.some((a) => a.id === id))) {
      return apiError("invalid_data");
    }
    sessionId = input.sessionId;
    quality = input.quality;
    observations = input.observations;
    observationCount = input.observations.length;
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin.from("sessions").select("id, study_id, status, consent_version, device_type").eq("id", sessionId).maybeSingle();
  if (error) return apiError("server_error");
  if (!session || session.study_id !== study.id || !["eye-v1", "eye-v2", "eye-v3"].includes(session.consent_version ?? "")) return apiError("not_found");
  if (session.status === "completed") return NextResponse.json({ ok: true }, { headers: noStore });
  if (session.status !== "started") return apiError("not_found");
  if (!completionAllowed(quality, session.device_type, observationCount, session.consent_version ?? "")) return apiError("incomplete");
  const device = session.device_type === "mobile" ? "phone" : session.device_type === "tablet" ? "tablet" : "laptop";

  const { error: insertError } = await admin.from("eye_tracking_runs").upsert({
    session_id: session.id,
    study_id: study.id,
    validation: {
      ...quality,
      driftChecks: quality.driftChecks?.map((check) => ({ ...check, passed: driftPasses(check, device) })),
      ...(quality.recovery ? {
        recovery: {
          ...quality.recovery,
          checks: quality.recovery.checks.map((check) => ({ ...check, passed: driftPasses(check, device) })),
        },
      } : {}),
      passed: qualityPasses(quality, session.device_type, observationCount),
    },
    observations,
  }, { onConflict: "session_id", ignoreDuplicates: true });
  if (insertError) return apiError("server_error");
  const { data: updated, error: updateError } = await admin.from("sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.id).eq("status", "started").select("id");
  if (updateError || !updated?.length) return apiError("server_error");
  return NextResponse.json({ ok: true }, { headers: noStore });
}
