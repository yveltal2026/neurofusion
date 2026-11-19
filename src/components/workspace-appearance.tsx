"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { WorkspaceThemeContext } from "./workspace-theme-context";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
  type WorkspaceTheme,
} from "@/lib/workspace-theme";

export function WorkspaceAppearance({
  initialTheme,
  navigation,
  account,
  children,
}: {
  initialTheme: WorkspaceTheme;
  navigation: ReactNode;
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
      <div
        data-workspace-theme={theme}
        className="workspace-background flex min-h-dvh flex-1 flex-col"
      >
        <a
          href="#workspace-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
        >
          Ir al contenido
        </a>
        <header className="border-b border-border/50 bg-surface/80 print:hidden">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 px-4 py-2 sm:px-8">
            {navigation}
            <div className="ml-auto flex items-center gap-2">
              <label className="inline-flex items-center">
                <span className="sr-only">Tema de apariencia</span>
                <select
                  className="min-h-11 rounded-full border border-control bg-surface py-1.5 ps-3 text-sm font-semibold text-heading hover:bg-surface-muted"
                  value={theme}
                  onChange={(event) => selectTheme(event.currentTarget.value)}
                >
                  <option value="light">Claro</option>
                  <option value="dark">Profundo</option>
                  <option value="system">Sistema</option>
                </select>
              </label>
              {account}
            </div>
          </div>
        </header>
        <main
          id="workspace-content"
          className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-12 sm:px-8 md:pt-8"
        >
          {children}
        </main>
      </div>
    </WorkspaceThemeContext.Provider>
  );
}
