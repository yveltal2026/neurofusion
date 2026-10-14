import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toCsv } from "@/lib/csv";
import type { SeoAuditRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, ruleDef, SEVERITY_LABEL } from "@/tools/seo/engine";
import { toSeoAudit } from "@/tools/seo/results";

/** Hallazgos de una auditoría SEO en CSV. RLS decide qué puede leer el usuario. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/studies/[id]/audits/[auditId]/csv">) {
  const { id, auditId } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: row } = await supabase.from("seo_audits").select("*").eq("id", auditId).eq("study_id", id).maybeSingle<SeoAuditRow>();
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const audit = toSeoAudit(row);
  const csv = toCsv(
    ["severidad", "categoria", "elemento", "detalle", "url", "regla", "recomendacion"],
    audit.findings.map((f) => [
      SEVERITY_LABEL[f.severity],
      CATEGORY_LABEL[f.category],
      f.element,
      f.detail,
      f.url ?? "todo el sitio",
      f.rule,
      f.severity === "ok" ? "" : (ruleDef(f.rule)?.advice ?? ""),
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-seo-${audit.createdAt.slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
