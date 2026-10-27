import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { visualConfigSchema } from "@/tools/visual/config";
import { eyeObservationSchema, eyeQualitySchema } from "@/tools/visual/eye/schema";

/** CSV de coordenadas normalizadas, sin video ni datos personales. RLS limita el estudio al investigador. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/studies/[id]/eye/export">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: study } = await supabase.from("studies").select("config").eq("id", id).eq("tool_type", "visual").maybeSingle();
  const config = visualConfigSchema.safeParse(study?.config);
  if (!config.success || config.data.mode !== "pieces" || !config.data.eyeTracking) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("session,asset_id,time_ms,x_norm,y_norm,calibration_pass,error_deg,excluded\n"));
      let offset = 0;
      try {
        while (true) {
          const { data, error } = await supabase.from("eye_tracking_runs")
            .select("session_id, validation, observations")
            .eq("study_id", id)
            .order("created_at", { ascending: true })
            .order("session_id", { ascending: true })
            .range(offset, offset + 19);
          if (error) throw error;
          if (!data?.length) break;
          const { data: sessions, error: sessionError } = await supabase.from("sessions")
            .select("id, participant_ref, excluded").eq("study_id", id).in("id", data.map((r) => r.session_id));
          if (sessionError) throw sessionError;
          const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s]));
          for (const row of data) {
            const session = sessionMap.get(row.session_id);
            const quality = eyeQualitySchema.safeParse(row.validation);
            const observations = eyeObservationSchema.array().safeParse(row.observations);
            if (!session || !quality.success || !observations.success) continue;
            for (const observation of observations.data) {
              const lines = observation.samples.map((point) =>
                `${session.participant_ref},${observation.assetId},${point.t},${point.x},${point.y},${quality.data.passed},${quality.data.medianErrorDeg ?? ""},${session.excluded}\n`,
              );
              controller.enqueue(encoder.encode(lines.join("")));
            }
          }
          offset += data.length;
          if (data.length < 20) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="eyetracking-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
