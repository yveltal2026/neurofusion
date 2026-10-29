import { notFound } from "next/navigation";
import Link from "next/link";
import { BatteryTabs } from "@/components/battery-tabs";
import { requireUser } from "@/lib/auth/session";
import { loadBatteryAnalysis } from "@/tools/research-analysis/load";
import { ResearchAnalysisPanel } from "@/tools/research-analysis/panel";

export const metadata = { title: "Análisis de batería · CognIA" };
export const maxDuration = 120;
export default async function BatteryAnalysisPage({
  params,
}: PageProps<"/batteries/[id]/analysis">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const loaded = await loadBatteryAnalysis(supabase, id);
  if (!loaded) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-sm text-muted hover:underline"
          href={`/projects/${loaded.input.detail.battery.project_id}`}
        >
          ← Proyecto
        </Link>
        <h1 className="mt-1 text-3xl font-bold">
          {loaded.input.detail.battery.name}
        </h1>
      </div>
      <BatteryTabs id={id} active="analysis" />
      <p className="text-sm text-muted">
        Análisis integrado de los pasos de la batería. Solo incluye
        participantes que completaron la batería; respeta exclusiones y calidad
        por herramienta.
      </p>
      <ResearchAnalysisPanel
        supabase={supabase}
        id={id}
        kind="battery"
        n={loaded.n}
        aggregates={loaded.aggregates}
        canAnalyze={loaded.canAnalyze}
      />
    </div>
  );
}
