import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  apiError,
  availabilityError,
  loadSurveyByToken,
  noStore,
  readJson,
} from "@/lib/participant-api";
import {
  BATTERY_SESSION_COOKIE,
  clientIp,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  deviceCookieName,
  hashIp,
  newDeviceId,
  signDeviceId,
  verifyBatterySession,
  verifyDeviceCookie,
} from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { attachChildSession, authorizeChildLink } from "@/tools/battery/server";
import { startSurveySession } from "@/tools/survey/participant";

const bodySchema = z.object({
  /** Si el paso corre dentro de una batería, la sesión de batería a la que se enlaza. */
  batterySessionId: z.string().uuid().optional(),
  consent: z.literal(true),
  device: z.object({
    inputMode: z.enum(["keyboard", "touch"]),
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    screenWidth: z.number().int().min(0).max(20000),
    screenHeight: z.number().int().min(0).max(20000),
  }),
});

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/s/[token]/survey/start">,
) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);

  // Generoso a propósito: en un salón de clase muchos alumnos comparten IP.
  const limited = rateLimit(
    `survey-start:${ip ?? "unknown"}`,
    120,
    10 * 60_000,
  );
  if (!limited.ok)
    return apiError(
      "rate_limited",
      {},
      { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
    );

  const loaded = await loadSurveyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const unavailable = availabilityError(study);
  if (unavailable) return apiError(unavailable);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const admin = createAdminClient();

  // Dentro de una batería: la cookie firmada debe coincidir con la sesión indicada y el estudio debe ser un paso activo suyo.
  if (body.batterySessionId) {
    const owns = verifyBatterySession(request.cookies.get(BATTERY_SESSION_COOKIE)?.value, secret) === body.batterySessionId;
    if (!owns || !(await authorizeChildLink(admin, study.id, body.batterySessionId))) return apiError("not_found");
  }

  const cookieName = deviceCookieName(study.id);
  const deviceId =
    verifyDeviceCookie(request.cookies.get(cookieName)?.value, secret) ??
    newDeviceId();

  const started = await startSurveySession(admin, study, {
    deviceId,
    ipHash: ip ? hashIp(ip, study.id, secret) : null,
    userAgent: request.headers.get("user-agent"),
    device: body.device,
  });
  if (!started.ok) return apiError(started.code);
  if (body.batterySessionId && !(await attachChildSession(admin, study.id, started.sessionId, body.batterySessionId))) {
    return apiError("server_error");
  }

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
