"use client";

import { useState, useTransition } from "react";
import { updateBatterySteps } from "@/app/(app)/batteries/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StepsEditor, type DraftStep, type StudyOption } from "./StepsEditor";

/** Edita el orden y los pasos activos de una batería SIN respuestas (con datos, el servidor lo rechaza). */
export function BatteryStepsForm({ batteryId, studies, initial }: { batteryId: string; studies: StudyOption[]; initial: DraftStep[] }) {
  const [steps, setSteps] = useState(initial);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <StepsEditor
        studies={studies}
        steps={steps}
        onChange={(next) => {
          setSteps(next);
          setState({});
        }}
      />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert>Pasos guardados.</Alert> : null}
      <Button
        type="button"
        disabled={pending || steps.length === 0}
        onClick={() =>
          startTransition(async () => {
            setState(await updateBatterySteps({ id: batteryId, steps }));
          })
        }
      >
        {pending ? "Guardando…" : "Guardar pasos"}
      </Button>
    </div>
  );
}
