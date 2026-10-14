import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import {
  apiError,
  availabilityError,
  loadBatteryByToken,
  noStore,
} from "@/lib/participant-api";
import {
  clientIp,
  deviceCookieName,
  verifyDeviceCookie,
} from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pre-chequeo al abrir la liga de la batería: avisa de inmediato ("ya participaste", "cerrada").
 * El candado real sigue siendo claim_battery_session en /start.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/b/[token]/check">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `battery-check:${clientIp(request.headers) ?? "unknown"}`,
    240,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study: battery } = loaded;

  const unavailable = availabilityError(battery);
  if (unavailable) return apiError(unavailable);

  if (battery.duplicate_policy !== "none") {
    const deviceId = verifyDeviceCookie(
      request.cookies.get(deviceCookieName(battery.id))?.value,
      serverEnv().PARTICIPANT_LOCK_SECRET,
    );
    if (deviceId) {
      const { count } = await createAdminClient()
        .from("battery_sessions")
        .select("id", { count: "exact", head: true })
        .eq("battery_id", battery.id)
        .eq("device_id", deviceId)
        .eq("status", "completed");
      if (count) return apiError("already_participated");
    }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
