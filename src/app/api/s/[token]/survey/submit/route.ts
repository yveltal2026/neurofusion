import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  loadSurveyByToken,
  noStore,
  readJson,
} from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitSurveyAnswers } from "@/tools/survey/participant";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
});

/**
 * Guarda las respuestas y cierra la sesión. El servidor valida contra la
 * configuración del estudio y calcula las puntuaciones; no acepta las del cliente.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/s/[token]/survey/submit">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `survey-submit:${clientIp(request.headers) ?? "unknown"}`,
    240,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadSurveyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const result = await submitSurveyAnswers(
    createAdminClient(),
    loaded.study,
    body.sessionId,
    body.answers,
  );
  if (!result.ok)
    return apiError(
      result.code,
      result.detail ? { detail: result.detail } : {},
    );
  return NextResponse.json({ ok: true }, { headers: noStore });
}
