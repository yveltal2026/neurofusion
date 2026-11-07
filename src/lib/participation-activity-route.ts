import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { isPlausibleToken } from "@/lib/magic-link";
import {
  deviceCookieName,
  verifyDeviceCookie,
  clientIp,
} from "@/lib/participant-lock";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, noStore } from "@/lib/participant-api";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ sessionId: z.string().uuid(), away: z.boolean() });

export async function handleParticipationActivity(
  request: NextRequest,
  token: string,
  kind: "study" | "battery",
) {
  if (!isPlausibleToken(token)) return apiError("invalid_link");
  if (
    !rateLimit(
      `presence-ip:${clientIp(request.headers) ?? "unknown"}`,
      1200,
      60_000,
    ).ok
  )
    return apiError("rate_limited");
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return apiError("invalid_data");
    body = JSON.parse(raw);
  } catch {
    return apiError("invalid_data");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("invalid_data");
  const admin = createAdminClient();
  const { data: parent, error } = await admin
    .from(kind === "study" ? "studies" : "batteries")
    .select("id")
    .eq("access_token", token)
    .maybeSingle();
  if (error) return apiError("server_error");
  if (!parent) return apiError("invalid_link");
  const device = verifyDeviceCookie(
    request.cookies.get(deviceCookieName(parent.id))?.value,
    serverEnv().PARTICIPANT_LOCK_SECRET,
  );
  if (!device) return apiError("not_found");
  if (
    !rateLimit(`presence-session:${kind}:${parsed.data.sessionId}`, 20, 60_000)
      .ok
  )
    return apiError("rate_limited");
  const { data: result, error: rpcError } = await admin.rpc(
    "touch_participation_activity",
    {
      p_kind: kind,
      p_parent: parent.id,
      p_session: parsed.data.sessionId,
      p_device: device,
      p_away: parsed.data.away,
    },
  );
  if (rpcError) return apiError("server_error");
  if (result === "not_found") return apiError("not_found");
  if (result === "expired")
    return NextResponse.json(
      { ok: false, expired: true },
      { status: 409, headers: noStore },
    );
  if (result !== "ok" && result !== "completed")
    return apiError("server_error");
  return NextResponse.json({ ok: true }, { headers: noStore });
}
