"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useWorkspaceThemeControls } from "@/components/workspace-appearance";
import { changeAccountPassword, type AuthState } from "@/lib/auth/actions";
import type { WorkspaceTheme } from "@/lib/workspace-theme";

const APPEARANCE_OPTIONS: { value: WorkspaceTheme; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Fondo neutro luminoso con tarjetas blancas." },
  { value: "dark", label: "Profundo", hint: "Superficie oscura de alto contraste." },
  { value: "system", label: "Sistema", hint: "Sigue la preferencia de tu dispositivo." },
];

export function SettingsAppearancePanel() {
  const { theme, selectTheme } = useWorkspaceThemeControls();

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Apariencia de la plataforma"
        className="grid gap-2.5 sm:grid-cols-3"
      >
        {APPEARANCE_OPTIONS.map((option) => {
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => selectTheme(option.value)}
              className={`flex flex-col items-start gap-1 rounded-[14px] border p-3.5 text-left transition-[border-color,background-color,transform] duration-[var(--duracion-micro)] active:scale-[0.98] motion-reduce:transition-none ${
                active
                  ? "border-accent-ink bg-neuro-tint/70 text-heading"
                  : "border-border bg-background/60 text-muted hover:border-control hover:text-heading"
              }`}
            >
              <span className="text-sm font-bold text-heading">{option.label}</span>
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

  return (
    <form action={action} className="space-y-4">
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
      {state.message ? <Alert tone="info">{state.message}</Alert> : null}

      <Button type="submit" variant="inverse" disabled={pending}>
        {pending ? "Actualizando..." : "Actualizar contraseña"}
      </Button>
    </form>
  );
}
