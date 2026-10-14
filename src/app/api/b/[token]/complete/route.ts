import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { apiError, noStore } from "@/lib/participant-api";
import { BATTERY_SESSION_COOKIE, clientIp, verifyBatterySession } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeBattery, loadBatteryByToken } from "@/tools/battery/server";

/** Cierra la sesión de batería tras verificar EN EL SERVIDOR que todos los pasos están completos. Idempotente. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/b/[token]/complete">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`battery-complete:${clientIp(request.headers) ?? "unknown"}`, 240, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const sessionId = verifyBatterySession(request.cookies.get(BATTERY_SESSION_COOKIE)?.value, secret);
  if (!sessionId) return apiError("not_found");

  const admin = createAdminClient();
  const loaded = await loadBatteryByToken(admin, token);
  if (!loaded.ok) return apiError(loaded.code);

  const result = await completeBattery(admin, loaded.battery, sessionId);
  if (!result.ok) return apiError(result.code, result.missing ? { missing: result.missing } : {});
  return NextResponse.json({ ok: true }, { headers: noStore });
}
