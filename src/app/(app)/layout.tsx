import Link from "next/link";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            href="/projects"
            className="rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            NeuroFusion
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Link
              href="/account"
              className="rounded-md px-2 py-1 transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title="Cuenta y ajustes"
            >
              <span className="hidden sm:inline">{user?.email ?? "Cuenta"}</span>
              <span className="sm:hidden">Cuenta</span>
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="h-8 px-3">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
