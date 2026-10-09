"use client";

import { useActionState } from "react";
import { createProject, type ProjectFormState } from "@/app/(app)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const initial: ProjectFormState = {};

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProject, initial);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Nombre del proyecto">
        <Input name="name" required maxLength={120} placeholder="Ej. Percepción de marcas de café" />
      </Field>
      <Field label="Descripción (opcional)">
        <Textarea name="description" maxLength={1000} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear proyecto"}
      </Button>
    </form>
  );
}
