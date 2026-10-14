"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { requestPasswordReset, updatePassword, type AuthState } from "@/lib/auth/actions";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/auth/password-reset";

const initial: AuthState = {};

/** Paso 1: la persona escribe su correo y recibe el enlace. */
export function ForgotPasswordForm({ expired }: { expired?: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <div className="w-full max-w-sm space-y-6">
      <AuthHeading title="Restablecer contraseña" />
      <p className="text-center text-sm">Escribe el correo de tu cuenta y te enviamos un enlace para crear una contraseña nueva.</p>

      {expired ? <Alert tone="warning">Ese enlace venció o ya se usó. Pide uno nuevo aquí abajo.</Alert> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert>{state.message}</Alert> : null}

      <form action={action} className="space-y-4">
        <Field label="Correo">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-heading underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}

/** Paso 2: con la sesión de recuperación que abre el enlace del correo, se elige la contraseña nueva. */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <div className="w-full max-w-sm space-y-6">
      <AuthHeading title="Crea tu contraseña nueva" />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <form action={action} className="space-y-4">
        <Field label="Contraseña nueva" hint={`Mínimo ${MIN_PASSWORD} caracteres`}>
          <Input name="password" type="password" required minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} autoComplete="new-password" />
        </Field>
        <Field label="Repite la contraseña">
          <Input name="confirm" type="password" required minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </div>
  );
}
