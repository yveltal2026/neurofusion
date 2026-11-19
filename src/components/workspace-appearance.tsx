"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { WorkspaceNav } from "@/components/workspace-nav";
import { WorkspaceThemeContext } from "./workspace-theme-context";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
  type WorkspaceTheme,
} from "@/lib/workspace-theme";

const WorkspaceControls = createContext<{
  account: ReactNode;
  selectTheme: (value: string) => void;
}>({ account: null, selectTheme: () => {} });

export function WorkspaceAppearance({
  initialTheme,
  account,
  children,
}: {
  initialTheme: WorkspaceTheme;
  account: ReactNode;
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
      <WorkspaceControls.Provider value={{ account, selectTheme }}>
        <div data-workspace-theme={theme} className="flex min-h-dvh flex-1 flex-col print:min-h-0">
          {children}
        </div>
      </WorkspaceControls.Provider>
    </WorkspaceThemeContext.Provider>
  );
}

export function WorkspaceFrame({ studyNav, children }: {
  studyNav?: ReactNode;
  children: ReactNode;
}) {
  const theme = useContext(WorkspaceThemeContext);
  const { account, selectTheme } = useContext(WorkspaceControls);
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
        className="workspace-sidebar bg-profundo print:hidden"
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
            <Logo width={132} tone="deep" decorative />
          </Link>
          <button
            ref={menuButton}
            type="button"
            aria-controls={panelId}
            aria-expanded={menuOpen}
            onClick={() => setOpenFor(menuOpen ? null : pathname)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-on-deep hover:bg-surface lg:hidden"
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
          <div className="mt-auto space-y-3 border-t border-border pt-3">
            <label className="flex min-h-11 items-center justify-between gap-2 px-2 text-sm text-on-deep-muted">
              Tema
              <select
                aria-label="Tema de apariencia"
                className="min-h-11 rounded-md border border-control bg-surface px-2 text-sm font-semibold text-heading hover:bg-surface-muted"
                value={theme}
                onChange={(event) => selectTheme(event.currentTarget.value)}
              >
                <option value="light">Claro</option>
                <option value="dark">Profundo</option>
                <option value="system">Sistema</option>
              </select>
            </label>
            <div className="flex min-w-0 items-center gap-2 px-2 text-sm text-on-deep-muted">
              <Icon name="user" className="size-5" />
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
