import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { apiError, availabilityError, loadStudyByToken, noStore, readJson } from "@/lib/participant-api";
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
import { cryptoRng } from "@/tools/iat/engine";
import { buildParticipantSchema, splitParticipantPayload, type ParticipantPayload } from "@/tools/iat/participant";
import { newCounterbalance } from "@/tools/iat/session";

const bodySchema = z.object({
  participant: z.unknown(),
  consent: z.literal(true),
  device: z.object({
    inputMode: z.enum(["keyboard", "touch"]),
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    screenWidth: z.number().int().min(0).max(20000),
    screenHeight: z.number().int().min(0).max(20000),
  }),
});

/** Versión del texto de consentimiento aceptado (se guarda por sesión). */
const CONSENT_VERSION = "v1";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/start">) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers);

  // Generoso a propósito: en un salón de clase muchos alumnos comparten IP.
  const limited = rateLimit(`start:${ip ?? "unknown"}`, 120, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited", {}, { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) });

  const loaded = await loadStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const unavailable = availabilityError(study);
  if (unavailable) return apiError(unavailable);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");
  const participant = buildParticipantSchema(study.config).safeParse(body.participant);
  if (!participant.success) {
    return apiError("invalid_data", { detail: participant.error.issues[0]?.message });
  }
  const { explicit, demographics } = splitParticipantPayload(participant.data as ParticipantPayload);

  const { PARTICIPANT_LOCK_SECRET: secret } = serverEnv();
  const cookieName = deviceCookieName(study.id);
  const existing = verifyDeviceCookie(request.cookies.get(cookieName)?.value, secret);
  const deviceId = existing ?? newDeviceId();

  const counterbalance = newCounterbalance(study.config.dimensions.length, cryptoRng());

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_session", {
    p_study: study.id,
    p_device_id: deviceId,
    p_ip_hash: ip ? hashIp(ip, study.id, secret) : null,
    p_user_agent: request.headers.get("user-agent"),
    p_demographics: demographics,
    p_explicit: explicit,
    p_consent_version: CONSENT_VERSION,
    p_counterbalance: counterbalance,
    p_input_mode: body.device.inputMode,
    p_device_type: body.device.deviceType,
    p_screen_width: body.device.screenWidth,
    p_screen_height: body.device.screenHeight,
  });
  if (error) return apiError("server_error");

  const row = (data as { outcome: string; new_session_id: string | null }[] | null)?.[0];
  switch (row?.outcome) {
    case "ok": {
      const response = NextResponse.json(
        { ok: true, sessionId: row.new_session_id, counterbalance },
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
    case "already_participated":
      return apiError("already_participated");
    case "full":
      return apiError("full");
    case "closed":
      return apiError("closed");
    case "not_published":
    case "not_found":
      return apiError("not_available");
    default:
      return apiError("server_error");
  }
}
