import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeWebEyetrackingAggregate,
  stepEventSchema,
} from "@/tools/web-eyetracking/engine/metrics";
import { rawWebGazeSampleSchema } from "@/tools/web-eyetracking/engine/normalize";
import {
  buildCorsHeaders,
  loadWebEyeStudyByToken,
  resolveAllowedCorsOrigin,
} from "@/tools/web-eyetracking/server";

const MAX_SAMPLES_PER_RUN = 15_000;

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  validation: z.record(z.string(), z.unknown()).default({}),
  stepEvents: z.array(stepEventSchema).max(24).default([]),
  samples: z.array(rawWebGazeSampleSchema).max(2_000).default([]),
  final: z.boolean().default(false),
});

export async function OPTIONS(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadWebEyeStudyByToken(token);
  if (!loaded) return new NextResponse(null, { status: 404 });
  const origin = resolveAllowedCorsOrigin(
    request.headers.get("origin"),
    loaded.config.allowedOrigins,
  );
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadWebEyeStudyByToken(token);
  if (!loaded) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  const reqOrigin = request.headers.get("origin");
  const corsOrigin =
    loaded.config.mode === "live_snippet" && reqOrigin
      ? resolveAllowedCorsOrigin(reqOrigin, loaded.config.allowedOrigins)
      : reqOrigin;

  if (loaded.config.mode === "live_snippet" && reqOrigin && !corsOrigin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  const headers = buildCorsHeaders(corsOrigin);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("web_eyetracking_runs")
    .select("samples, step_events")
    .eq("session_id", parsed.data.sessionId)
    .eq("study_id", loaded.study.id)
    .maybeSingle();

  const prevSamples = Array.isArray(existing?.samples) ? existing.samples : [];
  const mergedSamples = [...prevSamples, ...parsed.data.samples].slice(
    0,
    MAX_SAMPLES_PER_RUN,
  );
  const mergedEvents =
    parsed.data.stepEvents.length > 0
      ? parsed.data.stepEvents
      : Array.isArray(existing?.step_events)
        ? existing.step_events
        : [];

  const summary = computeWebEyetrackingAggregate(
    [
      {
        stepEvents: mergedEvents as z.infer<typeof stepEventSchema>[],
        samples: mergedSamples as z.infer<typeof rawWebGazeSampleSchema>[],
      },
    ],
    loaded.config.steps.map((s) => s.id),
  );

  const { error } = await admin.from("web_eyetracking_runs").upsert({
    session_id: parsed.data.sessionId,
    study_id: loaded.study.id,
    mode: loaded.config.mode,
    validation: parsed.data.validation,
    step_events: mergedEvents,
    samples: mergedSamples,
    summary,
  });

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron guardar los eventos" },
      { status: 500, headers },
    );
  }

  if (parsed.data.final) {
    await admin
      .from("sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", parsed.data.sessionId)
      .eq("study_id", loaded.study.id);
  }

  return NextResponse.json(
    {
      ok: true,
      acceptedSamples: parsed.data.samples.length,
      completed: parsed.data.final,
    },
    { headers },
  );
}
