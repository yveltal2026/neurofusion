"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
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
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-ink/30 bg-surface px-2 py-0.5 text-xs font-semibold text-accent-ink">
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => {
    if (state.ok) {
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      setClientError(null);
    }
  }, [state]);

  const inputType = showPasswords ? "text" : "password";
  const displayedError = clientError ?? state.error;
  const hasError = Boolean(displayedError);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (password !== confirm) {
          event.preventDefault();
          setClientError("La nueva contraseña y su confirmación no coinciden.");
          return;
        }
        setClientError(null);
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        <Field label="Contraseña actual">
          <Input
            type={inputType}
            name="current_password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={hasError && !clientError ? true : undefined}
            aria-describedby={hasError && !clientError ? errorId : undefined}
            required
            className="sm:max-w-sm"
          />
        </Field>
        <p className="text-xs text-muted">
          ¿Olvidaste tu contraseña actual?{" "}
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center font-semibold text-accent-ink hover:underline"
          >
            Restablécela por correo
          </Link>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <Input
            type={inputType}
            name="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (clientError) setClientError(null);
            }}
            aria-invalid={hasError ? true : undefined}
            aria-describedby={hasError ? errorId : undefined}
            required
          />
        </Field>
        <Field label="Confirmar contraseña">
          <Input
            type={inputType}
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (clientError) setClientError(null);
            }}
            aria-invalid={hasError ? true : undefined}
            aria-describedby={hasError ? errorId : undefined}
            required
          />
        </Field>
      </div>

      {displayedError ? (
        <div id={errorId}>
          <Alert tone="error">{displayedError}</Alert>
        </div>
      ) : null}
      {!displayedError && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Actualizando..." : "Actualizar contraseña"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showPasswords}
          onClick={() => setShowPasswords((prev) => !prev)}
        >
          {showPasswords ? "Ocultar contraseñas" : "Mostrar contraseñas"}
        </Button>
      </div>
    </form>
  );
}
