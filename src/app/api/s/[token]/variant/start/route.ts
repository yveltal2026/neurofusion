import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  apiError,
  availabilityError,
  loadVariantByToken,
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
import { startVariantSession } from "@/tools/variants/participant";

const bodySchema = z.object({
  consent: z.literal(true),
  /** Sólo si la variante corre como paso de una batería. */
  batterySessionId: z.string().uuid().optional(),
  device: z.object({
    inputMode: z.enum(["keyboard", "touch"]),
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    screenWidth: z.number().int().min(0).max(20000),
    screenHeight: z.number().int().min(0).max(20000),
  }),
});

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/s/[token]/variant/start">,
) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);

  // Generoso a propósito: en un salón de clase muchos alumnos comparten IP.
  const limited = rateLimit(
    `variant-start:${ip ?? "unknown"}`,
    120,
    10 * 60_000,
  );
  if (!limited.ok)
    return apiError(
      "rate_limited",
      {},
      { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
    );

  const loaded = await loadVariantByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const unavailable = availabilityError(study);
  if (unavailable) return apiError(unavailable);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const cookieName = deviceCookieName(study.id);
  const deviceId =
    verifyDeviceCookie(request.cookies.get(cookieName)?.value, secret) ??
    newDeviceId();

  const started = await startVariantSession(createAdminClient(), study, {
    deviceId,
    ipHash: ip ? hashIp(ip, study.id, secret) : null,
    userAgent: request.headers.get("user-agent"),
    device: body.device,
    batterySessionId: body.batterySessionId,
  });
  if (!started.ok) return apiError(started.code);

  const response = NextResponse.json(
    { ok: true, sessionId: started.sessionId },
    { headers: noStore },
  );
  // Cookie de dispositivo (httpOnly): es el candado contra participación repetida.
  response.cookies.set(cookieName, signDeviceId(deviceId, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/api/s",
  });
  return response;
}
