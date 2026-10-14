"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveBatterySteps } from "../actions";
import { validateComposition, type BatteryStep } from "../engine";
import { StepsEditor, type AvailableStudy } from "./StepsEditor";

/** Pasos de una batería existente. Con participantes quedan en sólo lectura (se duplica para cambiarlos). */
export function BatteryStepsPanel({
  batteryId,
  initialSteps,
  available,
  locked,
}: {
  batteryId: string;
  initialSteps: BatteryStep[];
  available: AvailableStudy[];
  locked: boolean;
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [message, setMessage] = useState<{
    tone: "error" | "info";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(steps) !== JSON.stringify(initialSteps);

  function save() {
    const problems = validateComposition(steps);
    if (problems.length) {
      setMessage({ tone: "error", text: problems[0]! });
      return;
    }
    startTransition(async () => {
      const res = await saveBatterySteps({
        batteryId,
        steps: steps.map((s) => ({ studyId: s.studyId, enabled: s.enabled })),
      });
      setMessage(
        res.error
          ? { tone: "error", text: res.error }
          : { tone: "info", text: "Pasos guardados." },
      );
    });
  }

  return (
    <div className="space-y-4">
      <StepsEditor
        steps={steps}
        onChange={setSteps}
        available={available}
        readOnly={locked}
      />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {!locked ? (
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? "Guardando…" : "Guardar pasos"}
        </Button>
      ) : null}
    </div>
  );
}
