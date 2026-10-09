import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { iatConfigSchema } from "@/tools/iat/config";
import { loadSessionViews, loadTrialsForExport } from "@/tools/iat/results/load";
import { rawTrialsCsv, sessionSummaryCsv } from "@/tools/iat/results/views";

const kindSchema = z.enum(["raw_trials", "session_summary"]);

/** Exporta los datos del estudio a CSV. Usa la sesión del investigador, así que RLS decide qué ve. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/studies/[id]/export/[kind]">) {
  const { id, kind: rawKind } = await ctx.params;
  const kind = kindSchema.safeParse(rawKind);
  if (!z.string().uuid().safeParse(id).success || !kind.success) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: study } = await supabase.from("studies").select("id, config").eq("id", id).maybeSingle();
  if (!study) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const config = iatConfigSchema.safeParse(study.config);
  if (!config.success) return NextResponse.json({ error: "Configuración inválida" }, { status: 500 });

  const views = await loadSessionViews(supabase, id, config.data);
  const csv =
    kind.data === "session_summary"
      ? sessionSummaryCsv(config.data, views)
      : rawTrialsCsv(config.data, new Map(views.map((v) => [v.id, v.participant_ref])), await loadTrialsForExport(supabase, id));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind.data}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
