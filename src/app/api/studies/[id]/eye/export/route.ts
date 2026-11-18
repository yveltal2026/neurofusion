import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveEyeMediaType, visualConfigSchema } from "@/tools/visual/config";
import { eyeObservationSchema, eyeQualitySchema } from "@/tools/visual/eye/schema";
import { videoObservationSchema } from "@/tools/visual/video/schema";

function csvLine(cells: unknown[]): string {
  return cells.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",") + "\n";
}

/** CSV de coordenadas normalizadas y Facial Coding (si es video), sin almacenar grabaciones ni datos personales. */
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
  const isVideo = resolveEyeMediaType(config.data.eyeTracking) === "video";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (isVideo) {
        controller.enqueue(
          encoder.encode(
            "session,asset_id,record_type,time_ms,x_norm,y_norm,pose_valid,au01,au02,au04,au06,au07,au09,au10,au12,au14,au15,au24,au26,blink,calibration_pass,error_deg,excluded,measurement_status\n",
          ),
        );
      } else {
        controller.enqueue(
          encoder.encode(
            "session,asset_id,time_ms,x_norm,y_norm,calibration_pass,error_deg,excluded,recovery_interruptions,recalibrations,repeated_exposure,measurement_status\n",
          ),
        );
      }

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
            if (!session || !quality.success) continue;
            const status = quality.data.measurementStatus ?? (quality.data.passed ? "validated" : "unvalidated");

            if (isVideo) {
              const observations = videoObservationSchema.array().safeParse(row.observations);
              if (!observations.success) continue;
              for (const obs of observations.data) {
                const gazeLines = obs.gazeSamples.map((g) =>
                  csvLine([session.participant_ref, obs.assetId, "gaze", g.t, g.x, g.y,
                    ...Array(14).fill(""), quality.data.passed, quality.data.medianErrorDeg, session.excluded, status]),
                );
                if (gazeLines.length) controller.enqueue(encoder.encode(gazeLines.join("")));
                const facialLines = obs.facialSamples.map((f) =>
                  csvLine([session.participant_ref, obs.assetId, "facial", f.t, "", "", f.poseValid,
                    f.au01, f.au02, f.au04, f.au06, f.au07, f.au09, f.au10, f.au12, f.au14, f.au15, f.au24, f.au26, f.blink,
                    quality.data.passed, quality.data.medianErrorDeg, session.excluded, status]),
                );
                if (facialLines.length) controller.enqueue(encoder.encode(facialLines.join("")));
              }
            } else {
              const observations = eyeObservationSchema.array().safeParse(row.observations);
              if (!observations.success) continue;
              for (const observation of observations.data) {
                const lines = observation.samples.map((point) =>
                  `${session.participant_ref},${observation.assetId},${point.t},${point.x},${point.y},${quality.data.passed},${quality.data.medianErrorDeg ?? ""},${session.excluded},${quality.data.recovery?.interruptions ?? 0},${quality.data.recovery?.recalibrations ?? 0},${quality.data.recovery?.repeatedAssetIds.includes(observation.assetId) ?? false},${status}\n`,
                );
                controller.enqueue(encoder.encode(lines.join("")));
              }
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
