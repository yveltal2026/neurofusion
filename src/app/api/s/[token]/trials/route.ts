import { NextResponse, type NextRequest } from "next/server";
import { apiError, loadStudyByToken, noStore, readJson } from "@/lib/participant-api";
import { clientIp } from "@/lib/participant-lock";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTrialRows, counterbalanceSchema, planForDimension, trialBatchSchema } from "@/tools/iat/session";

/** Recibe los ensayos de UNA dimensión (el runner los envía al terminarla). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/s/[token]/trials">) {
  const { token } = await ctx.params;
  const limited = rateLimit(`trials:${clientIp(request.headers) ?? "unknown"}`, 600, 10 * 60_000);
  if (!limited.ok) return apiError("rate_limited");

  const loaded = await loadStudyByToken(token);
  if (!loaded.ok) return apiError(loaded.code);
  const { study } = loaded;

  const body = await readJson(request, trialBatchSchema);
  if (!body) return apiError("invalid_data");

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("sessions")
    .select("id, study_id, status, counterbalance")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (error) return apiError("server_error");
  // La sesión debe existir, pertenecer a ESTE estudio (el token) y seguir en curso.
  if (!session || session.study_id !== study.id) return apiError("not_found");
  if (session.status !== "started") return apiError("not_found");

  const counterbalance = counterbalanceSchema.safeParse(session.counterbalance);
  const entry = counterbalance.success ? counterbalance.data[body.dimensionIdx] : undefined;
  if (!entry || !study.config.dimensions[body.dimensionIdx]) return apiError("invalid_data");

  const plan = planForDimension(study.config, body.dimensionIdx, entry);
  const built = buildTrialRows(plan, body.dimensionIdx, body.trials);
  if (!built.ok) return apiError("invalid_data", { detail: built.error });

  const { error: insertError } = await admin.from("trials").upsert(
    built.rows.map((r) => ({ ...r, session_id: session.id, study_id: study.id })),
    // Idempotente: reenviar un lote tras un fallo de red no duplica ensayos.
    { onConflict: "session_id,dimension_idx,block,trial_idx", ignoreDuplicates: true },
  );
  if (insertError) return apiError("server_error");
  return NextResponse.json({ ok: true, stored: built.rows.length }, { headers: noStore });
}
