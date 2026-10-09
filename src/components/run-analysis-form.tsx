"use client";

import { useActionState } from "react";
import { runAnalysis, type AnalysisState } from "@/app/(app)/studies/[id]/analysis/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: AnalysisState = {};

export function RunAnalysisForm({ studyId, includeInvalid, hasAnalysis }: { studyId: string; includeInvalid: boolean; hasAnalysis: boolean }) {
  const [state, action, pending] = useActionState(runAnalysis, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="includeInvalid" value={includeInvalid ? "1" : "0"} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Analizando… (puede tardar un minuto)" : hasAnalysis ? "Volver a analizar con IA" : "Analizar con IA"}
      </Button>
    </form>
  );
}
