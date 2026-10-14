import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  apiError,
  availabilityError,
  loadBatteryByToken,
  noStore,
  readJson,
} from "@/lib/participant-api";
import {
  clientIp,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  deviceCookieName,
  hashIp,
  newDeviceId,
  signDeviceId,
  verifyDeviceCookie,
} from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadBatteryProgress,
  startBatterySession,
} from "@/tools/battery/participant";

const bodySchema = z.object({
  consent: z.literal(true),
  device: z.object({
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
  }),
});

/** Abre o reanuda la sesión de batería y devuelve los pasos (en su orden) con el progreso. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/b/[token]/start">,
) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);

  // Generoso a propósito: en un salón de clase muchos alumnos comparten IP.
  const limited = rateLimit(
    `battery-start:${ip ?? "unknown"}`,
    120,
    10 * 60_000,
  );
  if (!limited.ok)
    return apiError(
      "rate_limited",
      {},
      { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
    );

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study: battery } = loaded;

  const unavailable = availabilityError(battery);
  if (unavailable) return apiError(unavailable);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const cookieName = deviceCookieName(battery.id);
  const deviceId =
    verifyDeviceCookie(request.cookies.get(cookieName)?.value, secret) ??
    newDeviceId();

  const admin = createAdminClient();
  const started = await startBatterySession(admin, battery, {
    deviceId,
    ipHash: ip ? hashIp(ip, battery.id, secret) : null,
    userAgent: request.headers.get("user-agent"),
    deviceType: body.device.deviceType,
  });
  if (!started.ok) return apiError(started.code);

  const progress = await loadBatteryProgress(
    admin,
    battery.id,
    started.sessionId,
  );
  if (!progress.ok) return apiError(progress.code);

  const response = NextResponse.json(
    {
      ok: true,
      sessionId: started.sessionId,
      resumed: started.resumed,
      ...progress.value,
    },
    { headers: noStore },
  );
  // Cookie de dispositivo (httpOnly): candado contra repetición y clave para reanudar.
  response.cookies.set(cookieName, signDeviceId(deviceId, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/api/b",
  });
  return response;
}
