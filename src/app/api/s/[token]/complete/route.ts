import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, loadStudyByToken, noStore, readJson } from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { counterbalanceSchema, scoreSession, toResultRow, type StoredTrial } from "@/tools/iat/session";

const bodySchema = z.object({ sessionId: z.string().uuid() });

/**
 * Cierra la sesión: el servidor recalcula el D-score a partir de los ensayos
 * guardados (nunca confía en resultados del cliente) y exige que no falte ninguno.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/complete">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`complete:${clientIp(request.headers) ?? "unknown"}`, 240, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const body = await readJson(request, bodySchema);
  if (!body) return apiError("invalid_data");

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("sessions")
    .select("id, study_id, status, counterbalance")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (error) return apiError("server_error");
  if (!session || session.study_id !== study.id) return apiError("not_found");
  if (session.status === "completed") return NextResponse.json({ ok: true }, { headers: noStore }); // idempotente
  if (session.status !== "started") return apiError("not_found");

  const counterbalance = counterbalanceSchema.safeParse(session.counterbalance);
  if (!counterbalance.success) return apiError("server_error");

  // Una consulta por dimensión (≤ 200 filas): evita el tope de 1000 filas de PostgREST.
  const stored: StoredTrial[] = [];
  for (let dim = 0; dim < study.config.dimensions.length; dim++) {
    const { data, error: trialsError } = await admin
      .from("trials")
      .select("dimension_idx, block, rt_ms, error")
      .eq("session_id", session.id)
      .eq("dimension_idx", dim);
    if (trialsError) return apiError("server_error");
    stored.push(...((data ?? []) as StoredTrial[]));
  }

  const scored = scoreSession(study.config, counterbalance.data, stored);
  if (!scored.complete) return apiError("incomplete", { missing: scored.missing });

  const { error: resultsError } = await admin
    .from("session_results")
    .upsert(scored.dimensions.map((d) => toResultRow(session.id, study.id, d)), {
      onConflict: "session_id,dimension_idx",
    });
  if (resultsError) return apiError("server_error");

  const { error: updateError } = await admin
    .from("sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "started");
  if (updateError) return apiError("server_error");

  return NextResponse.json({ ok: true }, { headers: noStore });
}
