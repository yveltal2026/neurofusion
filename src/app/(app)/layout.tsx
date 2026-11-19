import { cookies } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { WorkspaceAppearance } from "@/components/workspace-appearance";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
} from "@/lib/workspace-theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    cookieStore,
  ] = await Promise.all([supabase.auth.getUser(), cookies()]);
  const theme = readWorkspaceTheme(
    cookieStore.get(WORKSPACE_THEME_COOKIE)?.value,
  );

  return (
    <WorkspaceAppearance
      initialTheme={theme}
      navigation={
        <>
          <Link
            href="/projects"
            aria-label="Aesteros, ir a proyectos"
            className="inline-flex min-h-11 shrink-0 items-center"
          >
            <Logo width={128} decorative />
          </Link>
          <WorkspaceNav />
        </>
      }
      account={
        <>
          {user?.email ? (
            <span className="hidden max-w-52 truncate text-sm text-muted lg:inline">
              {user.email}
            </span>
          ) : null}
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Salir
            </Button>
          </form>
        </>
      }
    >
      {children}
    </WorkspaceAppearance>
  );
}
