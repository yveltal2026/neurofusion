"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { WorkspaceNav } from "@/components/workspace-nav";
import { WorkspaceThemeContext } from "./workspace-theme-context";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
  type WorkspaceTheme,
} from "@/lib/workspace-theme";

export interface RecentSidebarStudy {
  id: string;
  name: string;
  icon: IconName;
}

const WorkspaceControls = createContext<{
  account: ReactNode;
  recentStudies: RecentSidebarStudy[];
  selectTheme: (value: string) => void;
}>({ account: null, recentStudies: [], selectTheme: () => {} });

export function WorkspaceAppearance({
  initialTheme,
  account,
  recentStudies = [],
  children,
}: {
  initialTheme: WorkspaceTheme;
  account: ReactNode;
  recentStudies?: RecentSidebarStudy[];
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const router = useRouter();

  function selectTheme(value: string) {
    const nextTheme = readWorkspaceTheme(value);
    setTheme(nextTheme);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WORKSPACE_THEME_COOKIE}=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    router.refresh();
  }

  return (
    <WorkspaceThemeContext.Provider value={theme}>
      <WorkspaceControls.Provider value={{ account, recentStudies, selectTheme }}>
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

const THEME_OPTIONS: { value: WorkspaceTheme; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Auto" },
];

export function WorkspaceFrame({ studyNav, children }: {
  studyNav?: ReactNode;
  children: ReactNode;
}) {
  const theme = useContext(WorkspaceThemeContext);
  const { account, recentStudies, selectTheme } = useContext(WorkspaceControls);
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
          {studyNav ?? (recentStudies.length ? (
            <section aria-label="Estudios recientes" className="space-y-1.5 border-t border-border/70 pt-4">
              <p className="px-3 text-xs font-semibold text-muted">Recientes</p>
              <ul className="space-y-0.5">
                {recentStudies.map((item) => (
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
          ) : null)}
          <div className="mt-auto space-y-2.5 rounded-xl border border-border bg-surface/80 p-2.5">
            <div
              role="group"
              aria-label="Tema de apariencia"
              className="grid grid-cols-3 gap-0.5 rounded-full border border-border/70 bg-surface-muted/80 p-0.5"
            >
              {THEME_OPTIONS.map((option) => {
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectTheme(option.value)}
                    className={`min-h-7 rounded-full px-2 text-[11px] font-semibold transition-[background-color,color,transform] duration-[var(--duracion-micro)] active:scale-[0.97] motion-reduce:transition-none ${
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
            <div className="flex min-w-0 items-center gap-2 border-t border-border/70 pt-2 text-xs text-muted">
              <Link
                href="/settings"
                aria-label="Abrir ajustes de usuario"
                title="Ajustes de usuario"
                className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-heading transition-colors hover:bg-surface-muted"
              >
                <Icon name="user" className="size-3.5" />
              </Link>
              {account}
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
