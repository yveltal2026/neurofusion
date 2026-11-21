"use client";

import { useActionState, useState } from "react";
import { createProject, type ProjectFormState } from "@/app/(app)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const initial: ProjectFormState = {};

export function NewProjectForm({ onCancel }: { onCancel?: () => void }) {
  const [state, action, pending] = useActionState(createProject, initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Nombre del proyecto">
        <Input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          required
          maxLength={120}
          placeholder="Ej. Percepción de marcas de café"
        />
      </Field>
      <Field label="Descripción (opcional)">
        <Textarea
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear proyecto"}
        </Button>
      </div>
    </form>
  );
}
