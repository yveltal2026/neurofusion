"use client";

import { useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function ConfirmSubmitButton({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger" | "inverse";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Procesando…" : label}
    </Button>
  );
}

function CancelButton({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
      Cancelar
    </Button>
  );
}

export function ConfirmActionDialog({
  triggerLabel,
  triggerVariant = "ghost",
  triggerSize = "md",
  triggerClassName = "",
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  action,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "inverse";
  triggerSize?: "md" | "sm" | "lg";
  triggerClassName?: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "secondary" | "ghost" | "danger" | "inverse";
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => dialog.current?.showModal()}
      >
        {triggerLabel}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-deep/65 sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={heading} className="text-xl font-bold text-heading">
            {title}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
            Cerrar
          </Button>
        </div>

        <p className="text-sm text-muted">{description}</p>

        <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
          {children}
          <CancelButton onClose={() => dialog.current?.close()} />
          <ConfirmSubmitButton label={confirmLabel} variant={confirmVariant} />
        </form>
      </dialog>
    </>
  );
}
