"use client";

import { useActionState, useSyncExternalStore } from "react";
import { updatePassword, updateProfile, type AccountActionState } from "@/app/(app)/account/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const initial: AccountActionState = {};

export function ProfileForm({ email, fullName }: { email: string; fullName: string }) {
  const [state, action, pending] = useActionState(updateProfile, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert>Perfil actualizado.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo electrónico" hint="Tu correo de acceso no se puede cambiar desde aquí.">
          <Input value={email} readOnly disabled className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted" />
        </Field>
        <Field label="Nombre completo">
          <Input name="full_name" defaultValue={fullName} placeholder="Ej. Dra. Sofía Ramírez" required maxLength={120} />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert>Contraseña actualizada.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Confirmar contraseña">
          <Input name="confirm" type="password" minLength={8} required autoComplete="new-password" />
        </Field>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Actualizando…" : "Actualizar contraseña"}
      </Button>
    </form>
  );
}

export function LocalTimezoneNotice() {
  const timeZone = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "detectando…",
  );

  return (
    <p className="text-sm text-muted">
      Zona horaria detectada en este navegador: <span className="font-medium text-foreground">{timeZone}</span>. Las
      fechas de cierre de tus estudios se muestran e interpretan en esta zona.
    </p>
  );
}
