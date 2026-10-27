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
import { startExposureStep } from "@/tools/battery/participant";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  studyId: z.string().uuid(),
});

/** Abre (o retoma) un paso de exposición: el participante va a ver las piezas de un estudio de imagen. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/b/[token]/exposure/start">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `battery-exposure:${clientIp(request.headers) ?? "unknown"}`,
    240,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return apiError(loaded.code);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const result = await startExposureStep(
    createAdminClient(),
    loaded.study.id,
    body.sessionId,
    body.studyId,
  );
  if (!result.ok) return apiError(result.code);
  return NextResponse.json(
    { ok: true, sessionId: result.sessionId },
    { headers: noStore },
  );
}
