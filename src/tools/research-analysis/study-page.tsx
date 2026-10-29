import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StudyHeader } from "@/components/study-header";
import { loadStudyAnalysis } from "./load";
import { ResearchAnalysisPanel } from "./panel";

export async function ResearchStudyAnalysis({
  id,
  supabase,
}: {
  id: string;
  supabase: SupabaseClient;
}) {
  const loaded = await loadStudyAnalysis(supabase, id);
  if (!loaded) notFound();
  return (
    <div className="space-y-6">
      <StudyHeader
        study={loaded.study}
        active="analysis"
        variant={loaded.variant}
      />
      <ResearchAnalysisPanel
        supabase={supabase}
        id={id}
        kind="study"
        n={loaded.n}
        aggregates={loaded.aggregates}
      />
    </div>
  );
}
