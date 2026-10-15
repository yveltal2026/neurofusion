import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  loadVariantByToken,
  noStore,
  readJson,
} from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitVariantResponses } from "@/tools/variants/participant";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  /** Tecla y latencia de cada ensayo; el servidor las valida contra el plan que él mismo regenera. */
  submission: z.unknown(),
});

/**
 * Guarda las respuestas y cierra la sesión. El servidor regenera el plan de la sesión,
 * valida contra él y calcula las puntuaciones; no acepta las del cliente.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/s/[token]/variant/submit">,
) {
  const { token } = await ctx.params;
  const limited = rateLimit(
    `variant-submit:${clientIp(request.headers) ?? "unknown"}`,
    240,
    10 * 60_000,
  );
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadVariantByToken(token);
  if (!loaded.ok) return apiError(loaded.code);

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const result = await submitVariantResponses(
    createAdminClient(),
    loaded.study,
    body.sessionId,
    body.submission,
  );
  if (!result.ok)
    return apiError(
      result.code,
      result.detail ? { detail: result.detail } : {},
    );
  return NextResponse.json({ ok: true }, { headers: noStore });
}
