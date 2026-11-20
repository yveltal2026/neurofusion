"use client";

import { useActionState, useId, useRef, useState } from "react";
import { deleteProject, type ProjectFormState } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initial: ProjectFormState = {};

export function DeleteProjectDialog({
  projectId,
  projectName,
  studyCount,
}: {
  projectId: string;
  projectName: string;
  studyCount: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(deleteProject, initial);

  const matches = confirmation.trim() === projectName.trim();

  function handleOpen() {
    setConfirmation("");
    dialog.current?.showModal();
  }

  function handleClose() {
    setConfirmation("");
    dialog.current?.close();
  }

  return (
    <>
      <Button type="button" variant="ghost" className="text-danger" onClick={handleOpen}>
        <Icon name="trash" className="size-5" />
        Eliminar proyecto
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={(event) => {
          if (event.target === dialog.current) handleClose();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-deep/65 sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={heading} className="text-xl font-bold text-heading">
            Eliminar proyecto
          </h2>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cerrar
          </Button>
        </div>

        <p className="text-sm text-muted">
          Esta acción es irreversible. Se eliminará <strong className="text-heading">{projectName}</strong>
          {studyCount > 0
            ? ` junto con ${studyCount} ${studyCount === 1 ? "estudio" : "estudios"}, sus respuestas y archivos asociados.`
            : " de forma permanente."}
        </p>

        <form action={action} className="mt-4 space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <input type="hidden" name="id" value={projectId} />
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="block text-sm font-medium text-heading">
              Escribe <span className="font-bold">{projectName}</span> para confirmar
            </label>
            <Input
              id={inputId}
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={projectName}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={!matches || pending}>
              <Icon name="trash" className="size-4" />
              {pending ? "Eliminando…" : "Eliminar definitivamente"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
