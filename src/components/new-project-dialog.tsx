"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/brand/icon";
import { NewProjectForm } from "@/components/new-project-form";
import { Button } from "@/components/ui/button";

export function NewProjectDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [formKey, setFormKey] = useState(0);

  function handleOpen() {
    setFormKey((k) => k + 1);
    dialog.current?.showModal();
  }

  function handleClose() {
    dialog.current?.close();
  }

  return (
    <>
      <Button type="button" onClick={handleOpen}>
        <Icon name="plus" className="size-4" />
        Nuevo proyecto
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={(event) => {
          if (event.target === dialog.current) handleClose();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-deep/65 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={heading} className="text-xl font-bold text-heading">Nuevo proyecto</h2>
          <Button type="button" variant="ghost" className="px-3" aria-label="Cerrar" onClick={handleClose}>
            <Icon name="close" className="size-4" />
          </Button>
        </div>
        <NewProjectForm key={formKey} onCancel={handleClose} />
      </dialog>
    </>
  );
}
