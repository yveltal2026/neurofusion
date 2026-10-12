"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signIn, signInWithGoogle, signUp, type AuthState } from "@/lib/auth/actions";

const initial: AuthState = {};

export function AuthForm({
  mode,
  next,
  urlError,
  resetOk,
}: {
  mode: "login" | "signup";
  next?: string;
  urlError?: string;
  resetOk?: boolean;
}) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, initial);
  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-sm space-y-6">
      <AuthHeading title={isLogin ? "Iniciar sesión" : "Crear cuenta"} />

      {resetOk ? <Alert>Listo, actualizamos tu contraseña. Inicia sesión con la nueva.</Alert> : null}
      {urlError ? <Alert tone="error">No se pudo completar el inicio de sesión. Inténtalo de nuevo.</Alert> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert>{state.message}</Alert> : null}

      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {!isLogin ? (
          <Field label="Nombre">
            <Input name="full_name" autoComplete="name" />
          </Field>
        ) : null}
        <Field label="Correo">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Contraseña" hint={isLogin ? undefined : "Mínimo 8 caracteres"}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </Field>
        {isLogin ? (
          <p className="-mt-1 text-right text-sm">
            <Link href="/forgot-password" className="font-medium text-heading underline underline-offset-4">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Procesando…" : isLogin ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" variant="secondary" className="w-full">
          Continuar con Google
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {isLogin ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="font-medium text-heading underline underline-offset-4">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-heading underline underline-offset-4">
              Inicia sesión
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
