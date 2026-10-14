import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { batteryReportCsv } from "@/tools/battery/report/csv";
import { loadBatteryReportInput } from "@/tools/battery/report/load";
import { buildBatteryReport } from "@/tools/battery/report/report";

/** CSV del informe integrado (una fila por participante). RLS decide qué baterías ve el investigador. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/batteries/[id]/export">) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const input = await loadBatteryReportInput(supabase, id);
  if (!input) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const csv = batteryReportCsv(buildBatteryReport(input.steps, input.participants));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="battery_report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
