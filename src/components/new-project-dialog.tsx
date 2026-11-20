"use client";

import { useId, useRef } from "react";
import { Icon } from "@/components/brand/icon";
import { NewProjectForm } from "@/components/new-project-form";
import { Button } from "@/components/ui/button";

export function NewProjectDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        <Icon name="plus" className="size-4" />
        Nuevo proyecto
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-deep/65 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={heading} className="text-xl font-bold">Nuevo proyecto</h2>
          <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
            Cerrar
          </Button>
        </div>
        <NewProjectForm onCancel={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}
