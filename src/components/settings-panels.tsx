"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useWorkspaceThemeControls } from "@/components/workspace-appearance";
import { changeAccountPassword, type AuthState } from "@/lib/auth/actions";
import { WORKSPACE_THEME_OPTIONS } from "@/lib/workspace-theme";

export function SettingsAppearancePanel() {
  const { theme, selectTheme } = useWorkspaceThemeControls();

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Apariencia de la plataforma"
        className="grid gap-2.5 sm:grid-cols-3"
      >
        {WORKSPACE_THEME_OPTIONS.map((option) => {
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => selectTheme(option.value)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition-[border-color,background-color,transform] duration-[var(--duracion-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                active
                  ? "border-accent-ink bg-neuro-tint/70 text-heading"
                  : "border-border bg-background/60 text-muted hover:border-control hover:text-heading"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2 text-sm font-bold text-heading">
                <span>{option.label}</span>
                {active ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-ink/30 bg-surface px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                    Activo
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted">{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const initialState: AuthState = {};

export function SettingsPasswordForm() {
  const [state, action, pending] = useActionState(changeAccountPassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Field label="Contraseña actual">
          <Input
            type="password"
            name="current_password"
            autoComplete="current-password"
            required
            className="sm:max-w-sm"
          />
        </Field>
        <p className="text-xs text-muted">
          ¿Olvidaste tu contraseña actual?{" "}
          <Link href="/forgot-password" className="font-semibold text-accent-ink hover:underline">
            Restablécela por correo
          </Link>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirmar contraseña">
          <Input
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Button type="submit" variant="inverse" disabled={pending}>
        {pending ? "Actualizando..." : "Actualizar contraseña"}
      </Button>
    </form>
  );
}
