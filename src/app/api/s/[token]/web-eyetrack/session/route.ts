import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCorsHeaders,
  loadWebEyeStudyByToken,
  resolveAllowedCorsOrigin,
} from "@/tools/web-eyetracking/server";

const bodySchema = z.object({
  participantRef: z.string().trim().min(6).max(120).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]).default("desktop"),
  viewport: z
    .object({
      width: z.number().int().min(100).max(10_000),
      height: z.number().int().min(100).max(10_000),
    })
    .optional(),
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
  if (loaded.study.status !== "published") {
    return NextResponse.json(
      { error: "El estudio no está publicado" },
      { status: 403, headers },
    );
  }

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
  const participantRef =
    parsed.data.participantRef ?? `we_${crypto.randomUUID().replace(/-/g, "")}`;

  const { data: session, error } = await admin
    .from("sessions")
    .insert({
      study_id: loaded.study.id,
      participant_ref: participantRef,
      status: "started",
      device_type: parsed.data.deviceType,
      screen_width: parsed.data.viewport?.width ?? null,
      screen_height: parsed.data.viewport?.height ?? null,
    })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: "No se pudo iniciar la sesión" },
      { status: 500, headers },
    );
  }

  return NextResponse.json(
    {
      sessionId: session.id,
      studyName: loaded.study.name,
      mode: loaded.config.mode,
      steps: loaded.config.steps.map((s) => ({
        id: s.id,
        title: s.title,
        instruction: s.instruction,
        advanceOn: s.advanceOn,
        urlPattern: s.urlPattern ?? null,
      })),
      calibration: loaded.config.calibration,
    },
    { headers },
  );
}
