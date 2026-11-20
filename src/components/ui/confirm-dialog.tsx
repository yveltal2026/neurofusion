"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, buttonClass } from "@/components/ui/button";

function SubmitButton({
  label,
  pendingLabel,
  variant,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ConfirmAction({
  action,
  hiddenFields,
  triggerLabel,
  triggerVariant = "danger",
  triggerClassName = "",
  title,
  description,
  confirmLabel,
  pendingLabel = "Procesando…",
  confirmVariant = "danger",
  requireText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerClassName?: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger";
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const inputId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function close() {
    setOpen(false);
    setTyped("");
    triggerRef.current?.focus();
  }

  const mismatch = Boolean(requireText && typed.trim() !== requireText.trim());

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass(triggerVariant, triggerClassName)}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h3 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h3>
            <p id={descId} className="text-sm text-muted">
              {description}
            </p>
          </div>

          <form action={action} className="space-y-4">
            {Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

            {requireText ? (
              <div className="space-y-1.5">
                <label htmlFor={inputId} className="block text-xs text-muted">
                  Escribe <strong className="font-semibold text-foreground">{requireText}</strong> para confirmar:
                </label>
                <input
                  id={inputId}
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <SubmitButton
                label={confirmLabel}
                pendingLabel={pendingLabel}
                variant={confirmVariant}
                disabled={mismatch}
              />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
