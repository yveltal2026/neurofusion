import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  loadBatteryByToken,
  noStore,
  readJson,
} from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeBatterySession } from "@/tools/battery/participant";

const bodySchema = z.object({ sessionId: z.string().uuid() });

/** Cierra la sesión de batería. La base de datos exige que TODOS los pasos estén completados. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/b/[token]/complete">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `battery-complete:${clientIp(request.headers) ?? "unknown"}`,
    240,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return apiError(loaded.code);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const result = await completeBatterySession(
    createAdminClient(),
    loaded.study.id,
    body.sessionId,
  );
  if (!result.ok) return apiError(result.code);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
