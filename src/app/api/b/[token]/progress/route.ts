import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { apiError, noStore } from "@/lib/participant-api";
import { BATTERY_SESSION_COOKIE, clientIp, verifyBatterySession } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { batteryProgress, loadBatteryByToken } from "@/tools/battery/server";

/**
 * Estado de cada paso, DERIVADO de las sesiones hijas guardadas (no de lo que diga el navegador).
 * Sirve para retomar tras recargar la página. Exige la cookie firmada de la sesión de batería.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/b/[token]/progress">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`battery-progress:${clientIp(request.headers) ?? "unknown"}`, 600, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const sessionId = verifyBatterySession(request.cookies.get(BATTERY_SESSION_COOKIE)?.value, secret);
  if (!sessionId) return apiError("not_found");

  const admin = createAdminClient();
  const loaded = await loadBatteryByToken(admin, token);
  if (!loaded.ok) return apiError(loaded.code);

  const result = await batteryProgress(admin, loaded.battery, sessionId);
  if (!result.ok) return apiError(result.code);
  return NextResponse.json({ ok: true, batterySessionId: sessionId, ...result.progress }, { headers: noStore });
}
