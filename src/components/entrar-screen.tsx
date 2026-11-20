"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signInWithGoogle, signUp, type AuthState } from "@/lib/auth/actions";

const initialState: AuthState = {};

export function EntrarScreen({
  initialMode = "login",
  next,
  urlError,
}: {
  initialMode?: "login" | "signup";
  next?: string;
  urlError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);

  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState);

  const isLogin = mode === "login";
  const activeState = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Ingresa un correo electrónico válido.");
      return;
    }
    setEmailError(null);
    setEmail(trimmed);
    setStep("password");
  }

  function handleJoinGroup(e: React.FormEvent) {
    e.preventDefault();
    const raw = groupCode.trim();
    if (!raw) {
      setGroupError("Ingresa el código de grupo o liga.");
      return;
    }
    setGroupError(null);
    const match = raw.match(/\/s\/([A-Za-z0-9_-]+)/);
    const token = match ? match[1] : raw;
    router.push(`/s/${encodeURIComponent(token)}`);
  }

  function switchMode(target: "login" | "signup") {
    setMode(target);
    setEmailError(null);
    if (target === "login") setStep("email");
  }

  const errorMessage =
    emailError ??
    activeState.error ??
    (urlError === "config"
      ? "Falta configurar Supabase (.env.local) para autenticar usuarios."
      : urlError
        ? "No se pudo completar el inicio de sesión. Inténtalo de nuevo."
        : null);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070604] px-4 py-12 text-white">
      {/* Resplandores ambientales ámbar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.22)_0%,rgba(180,100,0,0.08)_42%,transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.16)_0%,transparent_68%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/3 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.08)_0%,transparent_68%)] blur-2xl"
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Punto luminoso flotante superior izquierdo */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 -top-2 hidden h-1.5 w-1.5 rounded-full bg-[#ffb000] shadow-[0_0_12px_3px_rgba(255,176,0,0.75)] sm:block"
        />

        <div className="rounded-[24px] border border-white/[0.08] bg-[#110f0b]/85 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          {/* Logo Aesteros */}
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-3 w-3 rounded-full bg-white" />
              <span className="h-3 w-3 rounded-full bg-[#ff9f0a] shadow-[0_0_14px_3px_rgba(255,159,10,0.65)]" />
            </span>
            <span className="text-[20px] font-semibold tracking-tight text-white">aesteros</span>
          </div>

          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight text-white">
            {isLogin ? "Entrar" : "Crear cuenta"}
          </h1>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200"
            >
              {errorMessage}
            </div>
          ) : null}

          {activeState.message ? (
            <div
              role="status"
              className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200"
            >
              {activeState.message}
            </div>
          ) : null}

          {isLogin ? (
            step === "email" ? (
              <form key="login-email-form" onSubmit={handleEmailContinue} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="entrar-email"
                    className="block text-xs font-medium text-white/85"
                  >
                    Correo institucional o de trabajo
                  </label>
                  <input
                    id="entrar-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@institucion.com"
                    className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
                  />
                </div>
                <button
                  type="submit"
                  className="h-11 w-full cursor-pointer rounded-full bg-[#ffb000] text-sm font-semibold text-black transition hover:bg-[#ffbe2e]"
                >
                  Continuar
                </button>
              </form>
            ) : (
              <form key="login-password-form" action={loginAction} className="mt-5 space-y-4">
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <input type="hidden" name="email" value={email} />

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs">
                  <span className="truncate text-white/80">{email}</span>
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="ml-2 shrink-0 cursor-pointer font-medium text-[#ffb000] hover:underline"
                  >
                    Cambiar
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="entrar-password"
                    className="block text-xs font-medium text-white/85"
                  >
                    Contraseña
                  </label>
                  <input
                    id="entrar-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="h-11 w-full cursor-pointer rounded-full bg-[#ffb000] text-sm font-semibold text-black transition hover:bg-[#ffbe2e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Entrando…" : "Entrar"}
                </button>
              </form>
            )
          ) : (
            <form key="signup-form" action={signupAction} className="mt-5 space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-medium text-white/85"
                >
                  Nombre completo
                </label>
                <input
                  id="signup-name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-white/85"
                >
                  Correo institucional o de trabajo
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@institucion.com"
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-white/85"
                >
                  Contraseña
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
                />
              </div>

              <button
                type="submit"
                disabled={pending}
                className="mt-1 h-11 w-full cursor-pointer rounded-full bg-[#ffb000] text-sm font-semibold text-black transition hover:bg-[#ffbe2e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Creando cuenta…" : "Crear cuenta"}
              </button>
            </form>
          )}

          {/* Botones para generar nuevo usuario / OAuth */}
          <div className="mt-3 space-y-2.5">
            {isLogin ? (
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="h-10 w-full cursor-pointer rounded-full border border-white/25 bg-transparent text-sm font-medium text-white transition hover:border-white/50 hover:bg-white/[0.06]"
              >
                Crear nuevo usuario
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="h-10 w-full cursor-pointer rounded-full border border-white/25 bg-transparent text-sm font-medium text-white transition hover:border-white/50 hover:bg-white/[0.06]"
              >
                Ya tengo cuenta · Entrar
              </button>
            )}

            <form action={signInWithGoogle}>
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <button
                type="submit"
                className="h-10 w-full cursor-pointer rounded-full border border-white/15 bg-white/[0.03] text-sm font-medium text-white/90 transition hover:border-white/35 hover:bg-white/[0.08]"
              >
                Continuar con Google
              </button>
            </form>
          </div>

          <div className="my-6 h-px w-full bg-white/10" />

          {/* Sección de código de grupo */}
          <form onSubmit={handleJoinGroup}>
            <label
              htmlFor="group-code"
              className="block text-xs font-medium text-white/85"
            >
              Soy alumno y tengo un código de grupo
            </label>
            <div className="mt-2.5 flex items-center gap-2.5">
              <input
                id="group-code"
                type="text"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="Código"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/35 focus:border-[#ffb000]/75 focus:outline-none focus:ring-2 focus:ring-[#ffb000]/20"
              />
              <button
                type="submit"
                className="h-10 shrink-0 cursor-pointer rounded-full border border-white/30 px-5 text-sm font-medium text-white transition hover:border-white/60 hover:bg-white/[0.08]"
              >
                Unirme
              </button>
            </div>
            {groupError ? (
              <p className="mt-1.5 text-xs text-red-300">{groupError}</p>
            ) : null}
          </form>

          <p className="mt-3 text-xs leading-relaxed text-white/55">
            ¿Vas a participar en un estudio? No necesitas cuenta: abre la liga que te enviaron.
          </p>
        </div>
      </div>
    </div>
  );
}
