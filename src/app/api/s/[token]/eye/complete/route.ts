import { NextResponse, type NextRequest } from "next/server";
import { apiError, noStore } from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEyeStudyByToken } from "@/tools/visual/eye/participant.server";
import { eyeRunSchema, observationsMatchStudy, qualityPasses } from "@/tools/visual/eye/schema";

const MAX_BODY_BYTES = 300_000;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/eye/complete">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`eye-complete:${clientIp(request.headers) ?? "unknown"}`, 120, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");
  const loaded = await loadEyeStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return apiError("invalid_data");
  }
  if (raw.length > MAX_BODY_BYTES) return apiError("invalid_data");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return apiError("invalid_data");
  }
  const parsed = eyeRunSchema.safeParse(decoded);
  if (!parsed.success) return apiError("invalid_data");
  const input = parsed.data;
  if (!observationsMatchStudy(input.observations, study.assets.map((a) => a.id), study.config.eyeTracking.durationSeconds)) {
    return apiError("invalid_data");
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin.from("sessions").select("id, study_id, status, consent_version, device_type").eq("id", input.sessionId).maybeSingle();
  if (error) return apiError("server_error");
  if (!session || session.study_id !== study.id || session.consent_version !== "eye-v1") return apiError("not_found");
  if (session.status === "completed") return NextResponse.json({ ok: true }, { headers: noStore });
  if (session.status !== "started") return apiError("not_found");

  const { error: insertError } = await admin.from("eye_tracking_runs").upsert({
    session_id: session.id,
    study_id: study.id,
    validation: { ...input.quality, passed: qualityPasses(input.quality, session.device_type) },
    observations: input.observations,
  }, { onConflict: "session_id", ignoreDuplicates: true });
  if (insertError) return apiError("server_error");
  const { data: updated, error: updateError } = await admin.from("sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.id).eq("status", "started").select("id");
  if (updateError || !updated?.length) return apiError("server_error");
  return NextResponse.json({ ok: true }, { headers: noStore });
}
