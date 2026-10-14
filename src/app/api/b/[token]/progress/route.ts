import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, loadBatteryByToken, noStore } from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBatteryProgress } from "@/tools/battery/participant";

/** Progreso de la sesión, derivado de las sesiones de los pasos (nunca de lo que diga el cliente). */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/b/[token]/progress">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `battery-progress:${clientIp(request.headers) ?? "unknown"}`,
    600,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const sessionId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("sessionId"));
  if (!sessionId.success) return apiError("invalid_data");

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return apiError(loaded.code);

  const progress = await loadBatteryProgress(
    createAdminClient(),
    loaded.study.id,
    sessionId.data,
  );
  if (!progress.ok) return apiError(progress.code);
  return NextResponse.json(
    { ok: true, ...progress.value },
    { headers: noStore },
  );
}
