import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { iatConfigSchema } from "@/tools/iat/config";
import { loadSessionViews, loadTrialsForExport } from "@/tools/iat/results/load";
import { rawTrialsCsv, sessionSummaryCsv } from "@/tools/iat/results/views";
import { surveyConfigSchema } from "@/tools/survey/engine";
import { surveyCsv } from "@/tools/survey/results/csv";
import { loadSurveyRecords } from "@/tools/survey/results/load";
import { variantConfigSchema } from "@/tools/variants/config";
import { variantCsv } from "@/tools/variants/results/csv";
import { loadVariantRecords } from "@/tools/variants/results/load";

const kindSchema = z.enum(["raw_trials", "session_summary", "survey_responses", "variant_results"]);

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

  // Encuestas: una fila por participante (RLS decide qué estudios ve el investigador).
  if (kind.data === "survey_responses") {
    const { data: survey } = await supabase.from("studies").select("id, config").eq("id", id).eq("tool_type", "survey").maybeSingle();
    if (!survey) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const surveyConfig = surveyConfigSchema.safeParse(survey.config);
    if (!surveyConfig.success) return NextResponse.json({ error: "Configuración inválida" }, { status: 500 });
    return csvResponse(surveyCsv(surveyConfig.data, await loadSurveyRecords(supabase, id)), kind.data);
  }

  // Variantes del IAT: una fila por participante, con validez y banderas.
  if (kind.data === "variant_results") {
    const { data: variant } = await supabase.from("studies").select("id, config").eq("id", id).eq("tool_type", "iat_variant").maybeSingle();
    if (!variant) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const variantConfig = variantConfigSchema.safeParse(variant.config);
    if (!variantConfig.success) return NextResponse.json({ error: "Configuración inválida" }, { status: 500 });
    return csvResponse(variantCsv(variantConfig.data, await loadVariantRecords(supabase, id)), kind.data);
  }

  const { data: study } = await supabase.from("studies").select("id, config").eq("id", id).eq("tool_type", "iat").maybeSingle();
  if (!study) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const config = iatConfigSchema.safeParse(study.config);
  if (!config.success) return NextResponse.json({ error: "Configuración inválida" }, { status: 500 });

  const views = await loadSessionViews(supabase, id, config.data);
  const csv =
    kind.data === "session_summary"
      ? sessionSummaryCsv(config.data, views)
      : rawTrialsCsv(config.data, new Map(views.map((v) => [v.id, v.participant_ref])), await loadTrialsForExport(supabase, id));

  return csvResponse(csv, kind.data);
}

function csvResponse(csv: string, name: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
