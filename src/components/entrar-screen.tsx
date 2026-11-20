"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/auth/actions";

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
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState);

  const containerRef = useRef<HTMLDivElement>(null);
  const primaryGlowRef = useRef<HTMLDivElement>(null);
  const trailGlowRef = useRef<HTMLDivElement>(null);
  const targetPos = useRef({ x: 0.5, y: 0.5 });
  const primaryPos = useRef({ x: 0.5, y: 0.5 });
  const trailPos = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    let rafId = 0;

    const applyTransform = () => {
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();

      if (reducedMotion) {
        primaryPos.current = { ...targetPos.current };
        trailPos.current = { ...targetPos.current };
      } else {
        primaryPos.current.x += (targetPos.current.x - primaryPos.current.x) * 0.14;
        primaryPos.current.y += (targetPos.current.y - primaryPos.current.y) * 0.14;
        trailPos.current.x += (targetPos.current.x - trailPos.current.x) * 0.055;
        trailPos.current.y += (targetPos.current.y - trailPos.current.y) * 0.055;
      }

      if (primaryGlowRef.current) {
        primaryGlowRef.current.style.transform = `translate3d(${primaryPos.current.x * width}px, ${primaryPos.current.y * height}px, 0) translate(-50%, -50%)`;
      }
      if (trailGlowRef.current) {
        trailGlowRef.current.style.transform = `translate3d(${trailPos.current.x * width}px, ${trailPos.current.y * height}px, 0) translate(-50%, -50%)`;
      }

      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(applyTransform);
      }
    };

    rafId = window.requestAnimationFrame(applyTransform);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    targetPos.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

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
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070604] px-4 py-12 text-white"
    >
      {/* Resplandores ambientales base */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.18)_0%,rgba(180,100,0,0.06)_42%,transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.14)_0%,transparent_68%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/3 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(245,166,0,0.07)_0%,transparent_68%)] blur-2xl"
      />

      {/* Mapa de calor interactivo siguiendo el puntero detrás de la tarjeta */}
      <div
        ref={trailGlowRef}
        data-testid="heatmap-trail"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-0 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(255,140,0,0.22)_0%,rgba(220,38,80,0.14)_36%,rgba(124,58,237,0.06)_58%,transparent_74%)] blur-3xl will-change-transform"
      />
      <div
        ref={primaryGlowRef}
        data-testid="heatmap-hotspot"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-0 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,210,60,0.34)_0%,rgba(255,105,15,0.24)_32%,rgba(225,29,72,0.12)_56%,transparent_75%)] blur-2xl will-change-transform"
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

          {/* Botón para generar nuevo usuario */}
          <div className="mt-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
