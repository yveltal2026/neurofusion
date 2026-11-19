import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="workspace-background flex min-h-dvh flex-1 flex-col">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Ir al contenido
      </a>
      <header className="border-b border-border/50 bg-surface/80 print:hidden">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 px-4 py-2 sm:px-8">
          <Link href="/projects" aria-label="Aesteros, ir a proyectos" className="inline-flex min-h-11 shrink-0 items-center">
            <Logo width={128} decorative />
          </Link>
          <WorkspaceNav />
          <div className="ml-auto flex items-center gap-2">
            {user?.email ? <span className="hidden max-w-52 truncate text-sm text-muted lg:inline">{user.email}</span> : null}
            <form action={signOut}>
              <Button type="submit" variant="ghost">Salir</Button>
            </form>
          </div>
        </div>
      </header>
      <main id="workspace-content" className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-12 sm:px-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
