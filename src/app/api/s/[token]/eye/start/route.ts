import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { apiError, availabilityError, noStore, readJson } from "@/lib/participant-api";
import {
  clientIp, DEVICE_COOKIE_MAX_AGE_SECONDS, deviceCookieName, hashIp, newDeviceId, signDeviceId, verifyDeviceCookie,
} from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEyeStudyByToken } from "@/tools/visual/eye/participant.server";
import { linkStepSession } from "@/lib/battery-link";

const bodySchema = z.object({
  consent: z.literal(true),
  protocol: z.enum(["eye-v2", "eye-v3"]).optional(),
  batterySessionId: z.string().uuid().optional(),
  device: z.object({
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    screenWidth: z.number().int().min(1).max(20_000),
    screenHeight: z.number().int().min(1).max(20_000),
  }),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/eye/start">) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);
  const limited = rateLimit(`eye-start:${ip ?? "unknown"}`, 60, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadEyeStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;
  const unavailable = availabilityError(study);
  if (unavailable) return apiError(unavailable);
  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");
  if (body.protocol !== "eye-v2" && body.protocol !== "eye-v3") return apiError("not_available", { message: "La prueba se actualizó. Recarga la página para continuar con los controles de mirada." });

  const secret = serverEnv().PARTICIPANT_LOCK_SECRET;
  const cookieName = deviceCookieName(study.id);
  const deviceId = verifyDeviceCookie(request.cookies.get(cookieName)?.value, secret) ?? newDeviceId();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_session", {
    p_study: study.id,
    p_device_id: deviceId,
    p_ip_hash: ip ? hashIp(ip, study.id, secret) : null,
    p_user_agent: request.headers.get("user-agent"),
    p_demographics: {},
    p_explicit: null,
    p_consent_version: body.protocol,
    p_counterbalance: [],
    p_input_mode: body.device.deviceType === "desktop" ? "keyboard" : "touch",
    p_device_type: body.device.deviceType,
    p_screen_width: body.device.screenWidth,
    p_screen_height: body.device.screenHeight,
  });
  if (error) return apiError("server_error");
  const row = (data as { outcome: string; new_session_id: string | null }[] | null)?.[0];
  if (row?.outcome !== "ok" || !row.new_session_id) {
    if (row?.outcome === "already_participated" || row?.outcome === "full" || row?.outcome === "closed") return apiError(row.outcome);
    return apiError("not_available");
  }
  if (body.batterySessionId) {
    const linked = await linkStepSession(admin, row.new_session_id, body.batterySessionId);
    if (!linked.ok) return apiError(linked.code);
  }
  const response = NextResponse.json({ ok: true, sessionId: row.new_session_id }, { headers: noStore });
  response.cookies.set(cookieName, signDeviceId(deviceId, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/api/s",
  });
  return response;
}
