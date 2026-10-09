"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signIn, signInWithGoogle, signUp, type AuthState } from "@/lib/auth/actions";

const initial: AuthState = {};

export function AuthForm({
  mode,
  next,
  urlError,
}: {
  mode: "login" | "signup";
  next?: string;
  urlError?: string;
}) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, initial);
  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLogin ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p className="text-sm text-muted">NeuroFusion · estudios de neuromarketing</p>
      </div>

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
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Inicia sesión
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
