import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { apiError, availabilityError, noStore, readJson } from "@/lib/participant-api";
import {
  BATTERY_SESSION_COOKIE,
  clientIp,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  deviceCookieName,
  hashIp,
  newDeviceId,
  signBatterySession,
  signDeviceId,
  verifyDeviceCookie,
} from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { batteryConsentVersion, loadBatteryByToken, startBatterySession } from "@/tools/battery/server";

const bodySchema = z.object({
  consent: z.literal(true),
  device: z.object({ deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]) }),
});

/** Vigencia de la cookie de sesión de batería: lo que dura una sesión larga más un margen. */
const BATTERY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/b/[token]/start">) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);

  // Generoso a propósito: en un salón de clase muchos alumnos comparten IP.
  const limited = rateLimit(`battery-start:${ip ?? "unknown"}`, 120, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited", {}, { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) });

  const admin = createAdminClient();
  const loaded = await loadBatteryByToken(admin, token);
  if (!loaded.ok) return apiError(loaded.code);
  const { battery } = loaded;

  const unavailable = availabilityError(battery);
  if (unavailable) return apiError(unavailable);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const deviceCookie = deviceCookieName(battery.id);
  const deviceId = verifyDeviceCookie(request.cookies.get(deviceCookie)?.value, secret) ?? newDeviceId();

  const started = await startBatterySession(admin, battery, {
    deviceId,
    ipHash: ip ? hashIp(ip, battery.id, secret) : null,
    userAgent: request.headers.get("user-agent"),
    deviceType: body.device.deviceType,
    consentVersion: batteryConsentVersion(battery.config),
  });
  if (!started.ok) return apiError(started.code);

  const response = NextResponse.json({ ok: true, batterySessionId: started.batterySessionId }, { headers: noStore });
  const secure = process.env.NODE_ENV === "production";
  // Cookie de dispositivo (httpOnly): es el candado contra participación repetida en la batería.
  response.cookies.set(deviceCookie, signDeviceId(deviceId, secret), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/api/b",
  });
  // Cookie de sesión de batería (httpOnly): permite reanudar y autoriza a los pasos a enlazarse a ella.
  response.cookies.set(BATTERY_SESSION_COOKIE, signBatterySession(started.batterySessionId, secret), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: BATTERY_SESSION_MAX_AGE_SECONDS,
    path: "/api",
  });
  return response;
}
