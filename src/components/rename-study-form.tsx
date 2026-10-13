"use client";

import { useActionState } from "react";
import { renameStudy, type SettingsState } from "@/app/(app)/studies/[id]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initial: SettingsState = {};

export function RenameStudyForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameStudy, initial);
  return (
    <form action={action} className="flex flex-wrap items-start gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-64 flex-1">
        <Input name="name" defaultValue={name} required maxLength={160} aria-label="Nombre del estudio" />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Renombrar"}
      </Button>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert>Guardado.</Alert> : null}
    </form>
  );
}
