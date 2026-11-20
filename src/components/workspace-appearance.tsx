"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { WorkspaceNav } from "@/components/workspace-nav";
import { WorkspaceThemeContext } from "./workspace-theme-context";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
  WORKSPACE_THEME_OPTIONS,
  type WorkspaceTheme,
} from "@/lib/workspace-theme";

export interface RecentSidebarStudy {
  id: string;
  name: string;
  icon: IconName;
}

export interface AccountInfo {
  label: string;
  email: string | null;
}

const WorkspaceControls = createContext<{
  accountInfo: AccountInfo;
  recentStudies: RecentSidebarStudy[];
  signOutAction?: () => Promise<void>;
  selectTheme: (value: string) => void;
}>({
  accountInfo: { label: "Cuenta", email: null },
  recentStudies: [],
  selectTheme: () => {},
});

export function WorkspaceAppearance({
  initialTheme,
  accountInfo = { label: "Cuenta", email: null },
  recentStudies = [],
  signOutAction,
  children,
}: {
  initialTheme: WorkspaceTheme;
  accountInfo?: AccountInfo;
  recentStudies?: RecentSidebarStudy[];
  signOutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);

  function selectTheme(value: string) {
    const nextTheme = readWorkspaceTheme(value);
    setTheme(nextTheme);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WORKSPACE_THEME_COOKIE}=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  return (
    <WorkspaceThemeContext.Provider value={theme}>
      <WorkspaceControls.Provider
        value={{ accountInfo, recentStudies, signOutAction, selectTheme }}
      >
        <div data-workspace-theme={theme} className="flex min-h-dvh flex-1 flex-col print:min-h-0">
          {children}
        </div>
      </WorkspaceControls.Provider>
    </WorkspaceThemeContext.Provider>
  );
}

export function useWorkspaceThemeControls() {
  return {
    theme: useContext(WorkspaceThemeContext),
    selectTheme: useContext(WorkspaceControls).selectTheme,
  };
}


function LogoutIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function AccountPopover({ onNavigate }: { onNavigate?: () => void }) {
  const { accountInfo, signOutAction } = useContext(WorkspaceControls);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const initial = accountInfo.label.slice(0, 1).toLocaleUpperCase("es-MX") || "A";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Opciones de cuenta"
          className="mb-2 origin-bottom rounded-xl border border-border bg-surface p-1.5 shadow-[0_14px_32px_-12px_rgba(20,17,12,0.22)] lg:absolute lg:right-0 lg:bottom-full lg:left-0 lg:z-40"
        >
          {accountInfo.email ? (
            <p
              className="truncate border-b border-border/70 px-2.5 py-2 text-xs font-medium text-muted"
              title={accountInfo.email}
            >
              {accountInfo.email}
            </p>
          ) : null}
          <div className="mt-1 space-y-0.5">
            <Link
              href="/settings"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold text-heading transition-colors duration-[var(--duracion-micro)] hover:bg-surface-muted active:scale-[0.98]"
            >
              <Icon name="settings" className="size-4 shrink-0 text-muted" />
              Ajustes
            </Link>
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold text-danger transition-colors duration-[var(--duracion-micro)] hover:bg-danger/10 active:scale-[0.98]"
                >
                  <LogoutIcon className="size-4 shrink-0" />
                  Cerrar sesión
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors duration-[var(--duracion-micro)] hover:bg-surface-muted active:scale-[0.98]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-neuro-tint text-xs font-bold text-heading">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-heading">
            {accountInfo.label}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 border-r border-b border-muted transition-transform duration-[var(--duracion-micro)] ${
            open ? "-translate-y-0.5 rotate-[225deg]" : "-translate-y-0.5 rotate-45"
          }`}
        />
      </button>
    </div>
  );
}

export function WorkspaceFrame({ studyNav, children }: {
  studyNav?: ReactNode;
  children: ReactNode;
}) {
  const theme = useContext(WorkspaceThemeContext);
  const { recentStudies, selectTheme } = useContext(WorkspaceControls);
  const pathname = usePathname();
  const panelId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === pathname;

  return (
    <div className="workspace-frame">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 print:hidden"
      >
        Ir al contenido
      </a>
      <aside
        aria-label="Barra lateral"
        className="workspace-sidebar print:hidden"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setOpenFor(null);
            menuButton.current?.focus();
          }
        }}
      >
        <div className="flex min-h-17 items-center justify-between gap-3 px-4 lg:px-5">
          <Link
            href="/projects"
            aria-label="Aesteros, ir a proyectos"
            className="inline-flex min-h-11 shrink-0 items-center"
            onClick={() => setOpenFor(null)}
          >
            <Logo width={132} tone="auto" decorative />
          </Link>
          <button
            ref={menuButton}
            type="button"
            aria-controls={panelId}
            aria-expanded={menuOpen}
            onClick={() => setOpenFor(menuOpen ? null : pathname)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-heading transition-colors hover:bg-surface-muted active:scale-[0.97] lg:hidden"
          >
            <span aria-hidden="true" className="grid w-4 gap-1">
              <span className="h-px bg-current" />
              <span className="h-px bg-current" />
              <span className="h-px bg-current" />
            </span>
            Menú
          </button>
        </div>
        <div
          id={panelId}
          className={`${menuOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-4 lg:flex`}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]")) {
              const disclosure = event.target.closest("details");
              if (disclosure) disclosure.open = false;
              if (menuOpen) setOpenFor(null);
            }
          }}
        >
          <WorkspaceNav />
          {studyNav}
          {(() => {
            const visibleRecent = recentStudies
              .filter((item) => !pathname.startsWith(`/studies/${item.id}`))
              .slice(0, 3);
            if (!visibleRecent.length) return null;
            return (
              <section
                aria-label="Estudios recientes"
                className={`${studyNav ? "hidden lg:block " : ""}space-y-1.5 border-t border-border/70 pt-4`}
              >
                <p className="px-3 text-xs font-semibold text-muted">Recientes</p>
                <ul className="space-y-0.5">
                  {visibleRecent.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/studies/${item.id}`}
                        className="workspace-nav-link text-xs"
                        prefetch={false}
                      >
                        <Icon name={item.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}
          <div className="mt-auto space-y-2 rounded-xl border border-border bg-surface/80 p-2">
            <div
              role="group"
              aria-label="Tema de apariencia"
              className="grid grid-cols-3 gap-0.5 rounded-full border border-border/70 bg-surface-muted/80 p-0.5"
            >
              {WORKSPACE_THEME_OPTIONS.map((option) => {
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectTheme(option.value)}
                    className={`min-h-10 rounded-full px-2 text-xs font-semibold transition-[background-color,color,transform] duration-[var(--duracion-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-1 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                      active
                        ? "bg-surface text-heading shadow-xs"
                        : "text-muted hover:text-heading"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border/70 pt-1.5">
              <AccountPopover onNavigate={() => setOpenFor(null)} />
            </div>
          </div>
        </div>
      </aside>
      <main
        id="workspace-content"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-[1440px] px-4 pt-6 pb-12 sm:px-8 lg:pt-10 print:max-w-none print:p-0"
      >
        {children}
      </main>
    </div>
  );
}
