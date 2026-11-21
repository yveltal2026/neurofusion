"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { updateProject, type ProjectFormState } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const initial: ProjectFormState = {};

function EditProjectForm({
  projectId,
  initialName,
  initialDescription,
  onDirtyChange,
  onCancel,
  onSuccess,
}: {
  projectId: string;
  initialName: string;
  initialDescription: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(updateProject, initial);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");

  useEffect(() => {
    onDirtyChange(name !== initialName || description !== (initialDescription ?? ""));
  }, [name, description, initialName, initialDescription, onDirtyChange]);

  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="id" value={projectId} />
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
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

export function EditProjectDialog({
  projectId,
  projectName,
  projectDescription,
}: {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [formKey, setFormKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyNotice, setDirtyNotice] = useState(false);

  function handleOpen() {
    setFormKey((k) => k + 1);
    setIsDirty(false);
    setDirtyNotice(false);
    dialog.current?.showModal();
  }

  function handleClose() {
    setIsDirty(false);
    setDirtyNotice(false);
    dialog.current?.close();
  }

  function handleSuccess() {
    setIsDirty(false);
    setDirtyNotice(false);
    dialog.current?.close();
    const params = new URLSearchParams(window.location.search);
    params.set("updated", "1");
    router.replace(`/projects/${projectId}?${params.toString()}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={handleOpen}>
        Editar
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClose={() => {
          setIsDirty(false);
          setDirtyNotice(false);
        }}
        onClick={(event) => {
          if (event.target === dialog.current) {
            if (isDirty) setDirtyNotice(true);
            else handleClose();
          }
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-deep/65 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={heading} className="text-xl font-bold text-heading">
            Editar proyecto
          </h2>
          <Button type="button" variant="ghost" className="px-3" aria-label="Cerrar" onClick={handleClose}>
            <Icon name="close" className="size-4" />
          </Button>
        </div>
        {dirtyNotice && isDirty ? (
          <p role="status" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
            Tienes cambios sin guardar. Pulsa «Cancelar» para descartarlos.
          </p>
        ) : null}
        <EditProjectForm
          key={formKey}
          projectId={projectId}
          initialName={projectName}
          initialDescription={projectDescription}
          onDirtyChange={(dirty) => {
            setIsDirty(dirty);
            if (!dirty) setDirtyNotice(false);
          }}
          onCancel={handleClose}
          onSuccess={handleSuccess}
        />
      </dialog>
    </>
  );
}
