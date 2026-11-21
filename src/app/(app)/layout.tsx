import { cookies } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PlanCreditBadge } from "@/components/plan-credit-badge";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { WorkspaceAppearance } from "@/components/workspace-appearance";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { getOrgBillingSummary } from "@/lib/plans/server";
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

  let badge: { planBadge: string; planTier: "demo" | "academic" | "pro" | "enterprise"; credits: number } | null = null;
  if (user) {
    try {
      const { data: membership } = await supabase
        .from("memberships")
        .select("org_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (membership?.org_id) {
        const billing = await getOrgBillingSummary(supabase, membership.org_id, user.id);
        badge = {
          planBadge: billing.planBadge,
          planTier: billing.planTier,
          credits: billing.creditBalance,
        };
      }
    } catch {
      badge = null;
    }
  }

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
          {badge ? (
            <PlanCreditBadge
              planBadge={badge.planBadge}
              planTier={badge.planTier}
              credits={badge.credits}
            />
          ) : null}
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
