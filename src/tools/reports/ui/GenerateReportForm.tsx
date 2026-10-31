"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateStudyReport, type ReportActionState } from "../actions";

const initial: ReportActionState = {};
export function GenerateReportForm({
  studyId,
  ready,
  reason,
  hasReport,
}: {
  studyId: string;
  ready: boolean;
  reason: string;
  hasReport: boolean;
}) {
  const [state, action, pending] = useActionState(generateStudyReport, initial);
  return (
    <form
      action={action}
      className="space-y-3 print:hidden"
      aria-busy={pending}
    >
      <input type="hidden" name="studyId" value={studyId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && !pending ? (
        <p role="status" className="text-sm text-muted">
          Reporte guardado.
        </p>
      ) : null}
      {!ready ? <p className="text-sm text-muted">{reason}</p> : null}
      <Button type="submit" disabled={!ready || pending}>
        {pending
          ? "Elaborando reporte…"
          : hasReport
            ? "Actualizar reporte con IA"
            : "Analizar con IA"}
      </Button>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          Estamos redactando los hallazgos a partir de los resultados. Puede
          tardar hasta dos minutos.
        </p>
      ) : null}
    </form>
  );
}
