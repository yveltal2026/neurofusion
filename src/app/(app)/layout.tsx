import Link from "next/link";
import { Icon } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
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
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/projects" aria-label="NeuroFusion, ir a proyectos" className="flex items-center">
            <Logo width={120} />
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Link href="/muestra" className="hidden items-center gap-1.5 rounded-full px-3 py-2 font-medium text-heading hover:bg-heading/10 sm:inline-flex">
              <Icon name="target" className="size-5" />
              Calculadora de muestra
            </Link>
            <span className="hidden sm:inline">{user?.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost">
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
