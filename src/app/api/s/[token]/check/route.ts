import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { apiError, availabilityError, loadStudyByToken, noStore } from "@/lib/participant-api";
import { clientIp, deviceCookieName, verifyDeviceCookie } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pre-chequeo al abrir la liga: permite avisar de inmediato ("ya participaste",
 * "estudio cerrado") en vez de hacer llenar el formulario para después rechazarlo.
 * El candado real sigue siendo claim_session en /start.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/s/[token]/check">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`check:${clientIp(request.headers) ?? "unknown"}`, 240, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const unavailable = availabilityError(study);
  if (unavailable) return apiError(unavailable);

  if (study.duplicate_policy !== "none") {
    const deviceId = verifyDeviceCookie(
      request.cookies.get(deviceCookieName(study.id))?.value,
      serverEnv().PARTICIPANT_LOCK_SECRET,
    );
    if (deviceId) {
      const { count } = await createAdminClient()
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("study_id", study.id)
        .eq("device_id", deviceId)
        .eq("status", "completed");
      if (count) return apiError("already_participated");
    }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
